import type { FeatureLike } from 'ol/Feature';
import { asArray } from 'ol/color';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';

import type { OverpassLocationDTO } from '../api/generated';

/** How an Overpass layer draws its places. */
export type OverpassStyle =
  /** A colored marker labelled with the place name. */
  | { kind: 'point' }
  /** A colored line, optionally on a white casing so it stands out from the base map. */
  | { kind: 'line'; width: number; casing?: boolean }
  /** A tinted, outlined shape. Places stored without one show as a small dot. */
  | { kind: 'area' }
  /** A faintly tinted region with an outline, for Voronoi cells that tile the map side by side. */
  | { kind: 'cells' };

export type OverpassStyleFunction = (feature: FeatureLike) => Style | Style[];

/** Builds the style function for a layer. Styles are created once and reused for every feature. */
export function createOverpassStyle(style: OverpassStyle, color: string): OverpassStyleFunction {
  switch (style.kind) {
    case 'point': return pointStyle(color);
    case 'line': return lineStyle(color, style.width, style.casing ?? false);
    case 'area': return areaStyle(color);
    case 'cells': return cellStyle(color);
  }
}

function pointStyle(color: string): OverpassStyleFunction {
  const image = new CircleStyle({
    radius: 8,
    fill: new Fill({ color }),
    stroke: new Stroke({ color: '#ffffff', width: 2 })
  });
  const byName = new Map<string, Style>();

  return feature => {
    const name = (feature.get('place') as OverpassLocationDTO | undefined)?.name ?? '';
    let style = byName.get(name);
    if (!style) {
      style = new Style({
        image,
        text: new Text({
          text: name,
          font: 'bold 16px sans-serif',
          offsetY: -18,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        }),
        zIndex: 200
      });
      byName.set(name, style);
    }
    return style;
  };
}

function lineStyle(color: string, width: number, casing: boolean): OverpassStyleFunction {
  const line = new Style({ stroke: new Stroke({ color, width }), zIndex: 101 });
  const styles = casing
    ? [new Style({ stroke: new Stroke({ color: '#ffffff', width: width * 2 }), zIndex: 100 }), line]
    : [line];
  return () => styles;
}

function areaStyle(color: string): OverpassStyleFunction {
  const [red, green, blue] = asArray(color);
  const style = new Style({
    fill: new Fill({ color: [red, green, blue, 0.25] }),
    stroke: new Stroke({ color, width: 2 }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#ffffff', width: 1.5 })
    }),
    zIndex: 100
  });
  return () => style;
}

function cellStyle(color: string): OverpassStyleFunction {
  const [red, green, blue] = asArray(color);
  // Neighbouring cells share their edges, so each edge is drawn twice: a thin line is enough
  const style = new Style({
    fill: new Fill({ color: [red, green, blue, 0.08] }),
    stroke: new Stroke({ color, width: 1.5 }),
    zIndex: 50
  });
  return () => style;
}

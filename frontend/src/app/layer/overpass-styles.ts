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
  /** A tinted, outlined shape, optionally labelled with the place name. Places stored without one show as a small dot. */
  | { kind: 'area'; labels?: boolean }
  /**
   * A faintly tinted region with an outline, for regions that tile the map side by side (Voronoi cells, divisions),
   * optionally labelled with the place name.
   */
  | { kind: 'cells'; labels?: boolean };

export type OverpassStyleFunction = (feature: FeatureLike) => Style | Style[];

/** Builds the style function for a layer. Styles are created once and reused for every feature. */
export function createOverpassStyle(style: OverpassStyle, color: string): OverpassStyleFunction {
  switch (style.kind) {
    case 'point': return pointStyle(color);
    case 'line': return lineStyle(color, style.width, style.casing ?? false);
    case 'area': return areaStyle(color, style.labels ?? false);
    case 'cells': return cellStyle(color, style.labels ?? false);
  }
}

function pointStyle(color: string): OverpassStyleFunction {
  const image = new CircleStyle({
    radius: 8,
    fill: new Fill({ color }),
    stroke: new Stroke({ color: '#ffffff', width: 2 })
  });
  return withNameLabel(new Style({ image, zIndex: 200 }), color, 'bold 16px sans-serif', -18);
}

function lineStyle(color: string, width: number, casing: boolean): OverpassStyleFunction {
  const line = new Style({ stroke: new Stroke({ color, width }), zIndex: 101 });
  const styles = casing
    ? [new Style({ stroke: new Stroke({ color: '#ffffff', width: width * 2 }), zIndex: 100 }), line]
    : [line];
  return () => styles;
}

function areaStyle(color: string, labels: boolean): OverpassStyleFunction {
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
  if (!labels) return () => style;

  const shape = withNameLabel(style, color, REGION_FONT);
  // Places stored without a shape are dots: the name goes above them, as for points
  const dot = withNameLabel(style, color, REGION_FONT, -12);
  return feature => (feature.getGeometry()?.getType() === 'Point' ? dot : shape)(feature);
}

function cellStyle(color: string, labels: boolean): OverpassStyleFunction {
  const [red, green, blue] = asArray(color);
  // Neighbouring regions share their edges, so each edge is drawn twice: a thin line is enough
  const style = new Style({
    fill: new Fill({ color: [red, green, blue, 0.08] }),
    stroke: new Stroke({ color, width: 1.5 }),
    zIndex: 50
  });
  return labels ? withNameLabel(style, color, REGION_FONT) : () => style;
}

/** Smaller than point labels: shapes are labelled inside themselves, and many can be in view at once. */
const REGION_FONT = 'bold 13px sans-serif';

/**
 * Adds the place name to a style, as a copy made once per name. Shapes are labelled at a point inside them
 * (every part of a multi-part shape), and only where the name fits, so small lakes and islands go unlabelled.
 */
function withNameLabel(style: Style, color: string, font: string, offsetY = 0): OverpassStyleFunction {
  const byName = new Map<string, Style>();
  return feature => {
    const name = (feature.get('place') as OverpassLocationDTO | undefined)?.name ?? '';
    let labelled = byName.get(name);
    if (!labelled) {
      labelled = style.clone();
      labelled.setText(new Text({
        text: name,
        font,
        offsetY,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#ffffff', width: 3 })
      }));
      byName.set(name, labelled);
    }
    return labelled;
  };
}

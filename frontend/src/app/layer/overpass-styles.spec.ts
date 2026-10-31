import Feature from 'ol/Feature';
import { Point, Polygon } from 'ol/geom';
import { Style } from 'ol/style';

import { createOverpassStyle } from './overpass-styles';

describe('createOverpassStyle', () => {
  const place = (name: string) => new Feature({ place: { name } });

  it('labels points with the place name and reuses styles per name', () => {
    const style = createOverpassStyle({ kind: 'point' }, '#7b3fa0');
    const first = style(place('Museum')) as Style;

    expect(first.getText()?.getText()).toBe('Museum');
    expect(first.getText()?.getFill()?.getColor()).toBe('#7b3fa0');
    expect(style(place('Museum'))).toBe(first);
    expect(style(place('Other'))).not.toBe(first);
  });

  it('draws lines with an optional white casing twice as wide', () => {
    const cased = createOverpassStyle({ kind: 'line', width: 3, casing: true }, '#c2185b')(place('')) as Style[];
    expect(cased.map(style => [style.getStroke()?.getColor(), style.getStroke()?.getWidth()]))
      .toEqual([['#ffffff', 6], ['#c2185b', 3]]);

    const plain = createOverpassStyle({ kind: 'line', width: 2 }, '#0b4f8a')(place('')) as Style[];
    expect(plain).toHaveLength(1);
  });

  it('tints areas with a translucent version of the layer color', () => {
    const style = createOverpassStyle({ kind: 'area' }, '#1565c0')(place('')) as Style;
    expect(style.getFill()?.getColor()).toEqual([21, 101, 192, 0.25]);
    expect(style.getStroke()?.getColor()).toBe('#1565c0');
  });

  it('labels areas and regions with the place name only when asked', () => {
    const lake = new Feature({ place: { name: 'Vättern' }, geometry: new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]) });
    const area = createOverpassStyle({ kind: 'area', labels: true }, '#1565c0')(lake) as Style;
    expect(area.getText()?.getText()).toBe('Vättern');
    expect(area.getText()?.getOffsetY()).toBe(0);
    expect(area.getFill()?.getColor()).toEqual([21, 101, 192, 0.25]);

    // A lake stored without its shape is a dot, with the name above it
    const dot = new Feature({ place: { name: 'Vättern' }, geometry: new Point([0, 0]) });
    expect((createOverpassStyle({ kind: 'area', labels: true }, '#1565c0')(dot) as Style).getText()?.getOffsetY())
      .toBeLessThan(0);

    const region = createOverpassStyle({ kind: 'cells', labels: true }, '#d67d3d')(place('Uppsala')) as Style;
    expect(region.getText()?.getText()).toBe('Uppsala');

    expect((createOverpassStyle({ kind: 'cells' }, '#d67d3d')(place('Uppsala')) as Style).getText()).toBeNull();
    expect((createOverpassStyle({ kind: 'area' }, '#1565c0')(lake) as Style).getText()).toBeNull();
  });
});

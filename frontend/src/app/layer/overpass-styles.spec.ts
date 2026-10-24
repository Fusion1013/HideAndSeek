import Feature from 'ol/Feature';
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
});

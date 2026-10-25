import axe from 'axe-core';

import { expectNoAxeViolations } from './axe';

describe('expectNoAxeViolations', () => {
  function element(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    return host;
  }

  it('passes accessible markup', async () => {
    await expectNoAxeViolations(element('<button type="button">Start</button><label>Name <input type="text"></label>'));
  });

  it('finds what axe finds in jsdom', async () => {
    const broken = element('<button type="button"></button><input type="text"><p id="same"></p><p id="same"></p>');
    const results = await axe.run(broken, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(results.violations.map(violation => violation.id)).toEqual(
      expect.arrayContaining(['button-name', 'label']));
    await expect(expectNoAxeViolations(broken)).rejects.toThrow(/button-name/);
  });
});

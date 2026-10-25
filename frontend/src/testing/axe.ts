import axe from 'axe-core';

/**
 * Runs the axe accessibility checks on a rendered component and fails with every violation found. For specs only
 * (src/testing is not part of the app).
 *
 * jsdom does no layout, so colour contrast cannot be checked here; that is checked in a browser. Components are
 * checked on their own, outside the page's landmarks, so the rule that all content sits in a landmark is off too.
 */
export async function expectNoAxeViolations(element: Element): Promise<void> {
  const results = await axe.run(element, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false }
    }
  });
  const violations = results.violations.map(violation =>
    `${violation.id}: ${violation.help}\n${violation.nodes.map(node => `  ${node.html}`).join('\n')}`);
  expect(violations, violations.join('\n\n')).toEqual([]);
}

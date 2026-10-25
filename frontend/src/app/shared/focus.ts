import { afterNextRender, DOCUMENT, EnvironmentInjector, inject } from '@angular/core';

/**
 * Moves keyboard focus to an element by ID once the next change has been rendered. For when an action replaces
 * the control that triggered it (a button that turns into a confirmation, a form that turns into its result), so
 * focus does not fall back to the start of the page. Uses the environment's injector, so it still runs when the
 * component that asked is gone (e.g. after switching tabs).
 *
 * Call in an injection context to get the function; call that function after the change.
 */
export function injectFocusAfterRender(): (id: string) => void {
  const injector = inject(EnvironmentInjector);
  const document = inject(DOCUMENT);
  return id => afterNextRender({ write: () => document.getElementById(id)?.focus() }, { injector });
}

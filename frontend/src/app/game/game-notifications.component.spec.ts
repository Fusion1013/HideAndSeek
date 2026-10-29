import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { GameNotificationsComponent } from './game-notifications.component';
import { PushNotificationsService, PushState } from './push-notifications.service';

describe('GameNotificationsComponent', () => {
  let push: { state: ReturnType<typeof vi.fn>; turnOn: ReturnType<typeof vi.fn>; turnOff: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<GameNotificationsComponent>;
  let element: HTMLElement;

  async function render(state: PushState): Promise<void> {
    push = {
      state: vi.fn(() => Promise.resolve(state)),
      turnOn: vi.fn(() => Promise.resolve('on' satisfies PushState)),
      turnOff: vi.fn(() => Promise.resolve('off' satisfies PushState))
    };
    TestBed.configureTestingModule({
      imports: [GameNotificationsComponent],
      providers: [{ provide: PushNotificationsService, useValue: push }]
    });
    fixture = TestBed.createComponent(GameNotificationsComponent);
    fixture.componentRef.setInput('gameId', 'g1');
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  function button(): HTMLButtonElement | null {
    return element.querySelector('button');
  }

  it('turns the game\'s notifications on, and moves focus to the button that turns them off', async () => {
    await render('off');
    expect(push.state).toHaveBeenCalledWith('g1');
    expect(button()?.textContent).toContain('Turn on notifications');
    await expectNoAxeViolations(element);

    button()?.click();
    await fixture.whenStable();

    expect(push.turnOn).toHaveBeenCalledWith('g1');
    expect(element.textContent).toContain('On for this game on this device.');
    expect(document.activeElement?.id).toBe('notifications-off');
  });

  it('turns them off again', async () => {
    await render('on');

    button()?.click();
    await fixture.whenStable();

    expect(push.turnOff).toHaveBeenCalledWith('g1');
    expect(button()?.textContent).toContain('Turn on notifications');
  });

  it('explains how to get them on an iPhone, without a button', async () => {
    await render('install-first');

    expect(element.textContent).toContain('Add to Home Screen');
    expect(button()).toBeNull();
    await expectNoAxeViolations(element);
  });

  it('says why they could not be turned on', async () => {
    await render('off');
    push.turnOn.mockReturnValue(Promise.reject(new HttpErrorResponse({
      status: 400, error: { detail: 'Not a browser push service\'s address' }
    })));

    button()?.click();
    await fixture.whenStable();

    expect(element.querySelector('[role=alert]')?.textContent).toContain('Not a browser push service\'s address');
    expect(button()?.disabled).toBe(false);
  });
});

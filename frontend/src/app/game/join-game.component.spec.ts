import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { GameControllerService } from '../api/generated';
import { AccessTokenStore, TOKEN_STORAGE } from '../auth/access-token.store';
import { JoinGameComponent } from './join-game.component';
import { expectNoAxeViolations } from '../../testing/axe';

describe('JoinGameComponent', () => {
  let joinGame: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<JoinGameComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    joinGame = vi.fn(() => of({ gameId: 'g1', playerId: 'p2', playerToken: 'player-token' }));
    const storage = new Map<string, string>();
    TestBed.configureTestingModule({
      imports: [JoinGameComponent],
      providers: [
        provideRouter([]),
        { provide: GameControllerService, useValue: { joinGame } },
        { provide: TOKEN_STORAGE, useValue: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } }
      ]
    });
    fixture = TestBed.createComponent(JoinGameComponent);
    fixture.componentRef.setInput('code', 'abc234');
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  function type(selector: string, value: string): void {
    const input = element.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(): void {
    (element.querySelector('button[type=submit]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('takes the code from the invite link and joins with the trimmed name', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    expect((element.querySelector('#join-code') as HTMLInputElement).value).toBe('abc234');

    type('#join-name', '  Grace ');
    submit();

    expect(joinGame).toHaveBeenCalledWith({ inviteCode: 'abc234', displayName: 'Grace' });
    expect(TestBed.inject(AccessTokenStore).get('games', 'g1')).toBe('player-token');
    expect(navigate).toHaveBeenCalledWith(['/game', 'g1']);
  });

  it('asks for a name before joining', async () => {
    type('#join-name', '   ');
    submit();

    expect(joinGame).not.toHaveBeenCalled();
    expect(element.querySelector('[role=alert]')?.textContent).toBe('Enter your name.');
    expect(element.querySelector('#join-name')?.getAttribute('aria-invalid')).toBe('true');
    await expectNoAxeViolations(element);
  });

  it('shows why the game refused', () => {
    joinGame.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 409, error: { detail: 'This game has already started' } })));
    type('#join-name', 'Grace');
    submit();

    expect(element.querySelector('[role=alert]')?.textContent).toBe('This game has already started');
    expect((element.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBe(false);
  });
});

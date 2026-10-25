import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { HidingStationDTO, StationDTO } from '../api/generated';
import { GameMapService } from './game-map.service';
import { GameSessionService } from './game-session.service';
import { HidingPanelComponent } from './hiding-panel.component';
import { expectNoAxeViolations } from '../../testing/axe';

const STATIONS: StationDTO[] = [
  { stationId: 'central', name: 'Centralstationen', longitude: 11.97, latitude: 57.7 },
  { stationId: 'korsvagen', name: 'Korsvägen', longitude: 11.99, latitude: 57.69 },
  { stationId: 'brunnsparken', name: 'Brunnsparken', longitude: 11.968, latitude: 57.706 }
];

describe('HidingPanelComponent', () => {
  let status: ReturnType<typeof signal<'LOBBY' | 'HIDING' | 'SEEKING'>>;
  let hidingStation: ReturnType<typeof signal<HidingStationDTO | null>>;
  let pickedStation: ReturnType<typeof signal<StationDTO | null>>;
  let chooseHidingStation: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<HidingPanelComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    status = signal('HIDING');
    hidingStation = signal(null);
    pickedStation = signal(null);
    chooseHidingStation = vi.fn((stationId: string) => hidingStation.set({
      station: STATIONS.find(station => station.stationId === stationId)!, chosenBy: 'p2', chosenAt: '2026-10-25T12:00:00Z'
    }));

    TestBed.configureTestingModule({
      imports: [HidingPanelComponent],
      providers: [
        {
          provide: GameSessionService,
          useValue: {
            game: computed(() => ({ status: status() })),
            stations: signal(STATIONS),
            hidingStation,
            canChooseStation: computed(() => status() === 'HIDING'),
            busy: signal(false),
            error: signal(''),
            chooseHidingStation
          }
        },
        { provide: GameMapService, useValue: { pickedStation } }
      ]
    });
    fixture = TestBed.createComponent(HidingPanelComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  /** A station's button in the list, by the station named in its accessible name. */
  function listButton(name: string): HTMLButtonElement {
    return [...element.querySelectorAll('.station-list button')]
      .find(button => button.textContent?.trim().endsWith(`: ${name}`)) as HTMLButtonElement;
  }

  function listed(): string[] {
    return [...element.querySelectorAll('.station-list li > span')].map(item => item.textContent!.trim());
  }

  it('lets a hider choose a station from the list, and change it', async () => {
    await expectNoAxeViolations(element);
    expect(element.querySelector('[role=status]')?.textContent).toContain('Not chosen yet.');
    expect(listed()).toEqual(['Centralstationen', 'Korsvägen', 'Brunnsparken']);

    expect(listButton('Korsvägen').textContent?.replace(/\s+/g, ' ').trim()).toBe('Hide here: Korsvägen');
    listButton('Korsvägen').click();
    fixture.detectChanges();
    expect(chooseHidingStation).toHaveBeenCalledWith('korsvagen');
    expect(element.querySelector('[role=status]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('You hide at Korsvägen');
    expect(listButton('Korsvägen').disabled).toBe(true);
    expect(listButton('Korsvägen').textContent?.replace(/\s+/g, ' ').trim()).toBe('Chosen: Korsvägen');
  });

  it('narrows the list by search', () => {
    const search = element.querySelector('#station-search') as HTMLInputElement;
    search.value = 'korsvag';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(listed()).toEqual(['Korsvägen']);
  });

  it('offers a station clicked on the map', async () => {
    pickedStation.set(STATIONS[2]);
    fixture.detectChanges();
    await expectNoAxeViolations(element);
    expect(element.querySelector('#picked-heading')?.textContent).toBe('Brunnsparken');

    [...element.querySelectorAll('.picked button')].find(button => button.textContent?.trim() === 'Hide here')!
      .dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(chooseHidingStation).toHaveBeenCalledWith('brunnsparken');
    expect(pickedStation()).toBeNull();
  });

  it('no longer offers a choice once the hiding time is over', () => {
    status.set('SEEKING');
    fixture.detectChanges();
    expect(element.querySelector('.station-list')).toBeNull();
    expect(element.textContent).toContain('The hiding time is over');
  });
});

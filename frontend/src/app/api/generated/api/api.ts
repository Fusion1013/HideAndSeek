export * from './gtfsController.service';
import { GtfsControllerService } from './gtfsController.service';
export * from './hello.service';
import { HelloService } from './hello.service';
export * from './transit.service';
import { TransitService } from './transit.service';
export const APIS = [GtfsControllerService, HelloService, TransitService];

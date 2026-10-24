import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TransitService as TransitApiService } from '../api/generated/api/transit.service';
import type { VehiclePosition } from '../api/generated/model/vehiclePosition';

@Injectable({
    providedIn: 'root',
})
export class TransitService {

    private readonly transitApi = inject(TransitApiService);

    public readonly loadError = signal(false);
    public readonly vehiclePositions = signal<VehiclePosition[]>([]);
    public readonly vehiclePositionsLoading = signal(false);
    public readonly vehiclePositionsError = signal(false);
    /** When positions were last fetched successfully (epoch ms), or null before the first fetch. */
    public readonly vehiclePositionsUpdatedAt = signal<number | null>(null);

    public async refreshVehiclePositions(): Promise<VehiclePosition[]> {
        this.vehiclePositionsLoading.set(true);
        this.vehiclePositionsError.set(false);

        try {
            const response: unknown = await firstValueFrom(this.transitApi.getVehiclePositions());
            if (!Array.isArray(response)) {
                throw new Error('Vehicle positions response must be an array');
            }

            const positions = response.filter(isVehiclePosition);
            this.vehiclePositions.set(positions);
            this.vehiclePositionsUpdatedAt.set(Date.now());
            return positions;
        } catch (error: unknown) {
            this.vehiclePositionsError.set(true);
            throw error;
        } finally {
            this.vehiclePositionsLoading.set(false);
        }
    }

}

function isVehiclePosition(value: unknown): value is VehiclePosition {
    return typeof value === 'object' && value !== null;
}

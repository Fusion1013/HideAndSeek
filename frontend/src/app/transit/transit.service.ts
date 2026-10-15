import { inject, Injectable, signal } from '@angular/core';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import { Geometry } from 'ol/geom';
import Projection from 'ol/proj/Projection';
import { firstValueFrom } from 'rxjs';
import { TransitService as TransitApiService } from '../api/generated/api/transit.service';
import type { VehiclePosition } from '../api/generated/model/vehiclePosition';

interface LineMetadata {
    colors: Record<string, string>;
}

export interface TransitLineData {
    color: string;
    dir: string;
    headsign: string;
    line: string;
    mode: string;
    geometry: Geometry;
}

export interface TransitStopData {
    angle: number;
    linesArr: string[];
    color: string;
    colorDark: string;
    label: number;
    lines: string;
    mode: string;
    name: string;
    snapDist: number;
    terminus: number;
    feature: Feature<Geometry>;
}

@Injectable({
    providedIn: 'root',
})
export class TransitService {

    private readonly transitApi = inject(TransitApiService);

    public readonly loadError = signal(false);
    public readonly vehiclePositions = signal<VehiclePosition[]>([]);
    public readonly vehiclePositionsLoading = signal(false);
    public readonly vehiclePositionsError = signal(false);

    public readonly transitLines = signal<TransitLineData[]>([]);
    public readonly transitStops = signal<TransitStopData[]>([]);

    public readonly routesByLine = new Map<string, Feature<Geometry>[]>();
    public readonly stopsByLine = new Map<string, TransitStopData[]>();
    private loadPromise: Promise<void> | null = null;

    public async refreshVehiclePositions(): Promise<VehiclePosition[]> {
        this.vehiclePositionsLoading.set(true);
        this.vehiclePositionsError.set(false);

        try {
            const response: unknown = await firstValueFrom(this.transitApi.getVehiclePositions());
            console.log('Received vehicle positions response:', response);
            if (!Array.isArray(response)) {
                throw new Error('Vehicle positions response must be an array');
            }

            const positions = response.filter(isVehiclePosition);
            this.vehiclePositions.set(positions);
            return positions;
        } catch (error: unknown) {
            this.vehiclePositionsError.set(true);
            throw error;
        } finally {
            this.vehiclePositionsLoading.set(false);
        }
    }

    public loadTransitData(projection: Projection): Promise<void> {
        this.loadPromise ??= this.fetchTransitData(projection);
        return this.loadPromise;
    }

    private async fetchTransitData(projection: Projection): Promise<void> {
        try {
            const [routesResponse, stopsResponse, metadataResponse] = await Promise.all([
                fetch('/data/route.geojson'),
                fetch('/data/stops.geojson'),
                fetch('/data/lines-meta.json')
            ]);

            if (!routesResponse.ok || !stopsResponse.ok || !metadataResponse.ok) {
                throw new Error('Transit data request failed');
            }

            const [routesData, stopsData, metadata] = await Promise.all([
                routesResponse.json(),
                stopsResponse.json(),
                metadataResponse.json() as Promise<LineMetadata>
            ]);

            const format = new GeoJSON();
            const readOptions = { featureProjection: projection };
            const routeFeatures = format.readFeatures(routesData, readOptions);
            const stopFeatures = format.readFeatures(stopsData, readOptions);
            const transitLines: TransitLineData[] = [];
            const transitStops: TransitStopData[] = [];

            for (const feature of routeFeatures) {
                const line = feature.get('line');
                if (typeof line !== 'string') continue;

                const geometry = feature.getGeometry();
                if (!geometry) continue;

                const features = this.routesByLine.get(line) ?? [];
                features.push(feature);
                this.routesByLine.set(line, features);
                transitLines.push({
                    color: metadata.colors[line] ?? this.stringProperty(feature, 'color', '#0059a9'),
                    dir: this.stringProperty(feature, 'dir', ''),
                    headsign: this.stringProperty(feature, 'headsign', ''),
                    line,
                    mode: this.stringProperty(feature, 'mode', ''),
                    geometry
                });
            }

            for (const feature of stopFeatures) {
                const memberships = String(feature.get('lines') ?? '')
                    .split(',')
                    .map(line => line.trim())
                    .filter(Boolean);

                const stopData: TransitStopData = {
                    angle: this.numberProperty(feature, 'angle'),
                    linesArr: this.stringArrayProperty(feature, 'arr'),
                    color: this.stringProperty(feature, 'color', '#0059a9'),
                    colorDark: this.stringProperty(feature, 'colorDark', '#003d73'),
                    label: this.numberProperty(feature, 'label'),
                    lines: this.stringProperty(feature, 'lines', ''),
                    mode: this.stringProperty(feature, 'mode', ''),
                    name: this.stringProperty(feature, 'name', ''),
                    snapDist: this.numberProperty(feature, 'snapDist'),
                    terminus: this.numberProperty(feature, 'terminus'),
                    feature: feature.clone()
                };
                transitStops.push(stopData);

                for (const line of memberships) {
                    const transitStopDatas = this.stopsByLine.get(line) ?? [];
                    transitStopDatas.push(stopData);
                    this.stopsByLine.set(line, transitStopDatas);
                }
            }

            this.transitLines.set(transitLines);
            this.transitStops.set(transitStops);

        } catch (error: unknown) {
            this.loadError.set(true);
            throw error;
        }
    }

    private stringProperty(feature: Feature<Geometry>, key: string, fallback: string): string {
        const value = feature.get(key);
        return typeof value === 'string' ? value : fallback;
    }

    private numberProperty(feature: Feature<Geometry>, key: string): number {
        const value = feature.get(key);
        return typeof value === 'number' ? value : 0;
    }

    private stringArrayProperty(feature: Feature<Geometry>, key: string): string[] {
        const value: unknown = feature.get(key);
        return Array.isArray(value)
            ? value.filter((item): item is string => typeof item === 'string')
            : [];
    }
}

function isVehiclePosition(value: unknown): value is VehiclePosition {
    return typeof value === 'object' && value !== null;
}

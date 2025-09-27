/**
 * Module: config.js
 * Purpose: Centralized configuration for the radar simulator.
 * This file contains tunable parameters for simulation, display, and aircraft behavior.
 */

export const THEME_COLORS = {
    bgDark: '#1a1a1d',
    panelDark: '#2c2c34',
    border: '#444',
    textLight: '#e0e0e0',
    textMedium: '#a0a0a0',
    accentBlue: '#4a90e2',
    accentGreen: '#50e3c2',
    accentOrange: '#f5a623',
    accentRed: '#d0021b',
    sweep: 'rgba(0,255,0,0.15)',
    trail: 'rgba(0, 200, 255, 1)',
    grid: '#0a3',
    runway: '#444',
    leaderLine: '#666',
};

export const AIRCRAFT_PROFILES = {
    generic: {
        maxSpeed: 600,
        accel: 50,
        decel: 50,
        maxClimb: 4000, // fpm
        turnRateDegPerSec: 3,
    },
    hypersonic: {
        maxSpeed: 15000,
        accel: 2000,
        decel: 2000,
        maxClimb: 15000, // fpm
        turnRateDegPerSec: 0.5,
    },
};

export const SIM_CONFIG = {
    physicsStep: 1 / 30, // 30 Hz
    radarSweepRateDps: 90,
    trailDotDistanceKm: 2,
    maxTrailDots: 10,
};

export const DISPLAY_CONFIG = {
    headingVectorLength: 15,
    aircraftBlipSize: 4,
    selectedBlipSize: 6,
};
import fs from 'fs';
import { config } from './config.js';

let tokens = new Set<string>();

export function loadDeviceTokens(): void {
  try {
    const raw = fs.readFileSync(config.tokensFile, 'utf8');
    tokens = new Set(JSON.parse(raw));
  } catch {
    fs.writeFileSync(config.tokensFile, '[]');
    tokens = new Set();
  }
}

export function saveDeviceTokens(): void {
  fs.writeFileSync(config.tokensFile, JSON.stringify([...tokens], null, 2));
}

export function addDeviceToken(token: string): boolean {
  const before = tokens.size;
  tokens.add(token);
  if (tokens.size !== before) {
    saveDeviceTokens();
    return true;
  }
  return false;
}

export function removeDeviceToken(token: string): void {
  tokens.delete(token);
  saveDeviceTokens();
}

export function getDeviceTokens(): string[] {
  return [...tokens];
}

loadDeviceTokens();

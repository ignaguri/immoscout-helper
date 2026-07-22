import type { SiteDescriptor } from '@repo/site-adapter';

// The active site descriptor, set once by createEngine (or a temporary shim in
// the app entry until createEngine lands in Task 3.5). Module singleton, matching
// the existing background state style.
let activeDescriptor: SiteDescriptor | null = null;

export function setActiveDescriptor(descriptor: SiteDescriptor): void {
  activeDescriptor = descriptor;
}

export function getDescriptor(): SiteDescriptor {
  if (!activeDescriptor) {
    throw new Error('SiteDescriptor not set — call createEngine / setActiveDescriptor first');
  }
  return activeDescriptor;
}

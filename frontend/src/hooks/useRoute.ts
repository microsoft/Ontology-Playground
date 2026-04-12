import { useState, useEffect } from 'react';
import { currentRoute, onRouteChange, type Route } from '../lib/router';

/** React hook that returns the current Route and re-renders on hash changes. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    // Sync in case hash changed between render and effect
    setRoute(currentRoute());
    return onRouteChange(setRoute);
  }, []);

  return route;
}

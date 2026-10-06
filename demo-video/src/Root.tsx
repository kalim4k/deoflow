// Import explicite : l'API `bundle()` de Remotion compile le JSX en mode classique.
import React from 'react';
import { Composition } from 'remotion';
import { Demo } from './Demo';
import { FPS, HEIGHT, TOTAL, WIDTH } from './timeline';

export const Root = () => (
  <Composition
    id="deoflow-demo"
    component={Demo}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={TOTAL}
  />
);

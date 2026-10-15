import { describe, it, expect } from 'vitest';
import {
  ANALYSIS_LIMITS,
  REPLACE_CREATOR_MAX,
  REPLACE_PROVIDER_MAX,
  buildReplacePrompt,
  clip,
  replaceDisplayPrompt,
} from './replacePrompt';
import { capabilitiesFor } from './capabilities';

const ANALYSIS = {
  character:
    'A young woman with deep brown skin and long thin box braids, wearing a striped midi dress.',
  motion: [
    '0.0–1.8 s: the character stands facing the camera, the bag in the right hand.',
    '1.8–3.2 s: the character pivots to show the back, glancing over the shoulder.',
    '3.2–6.0 s: the character raises the left hand to the head.',
  ].join('\n'),
  camera: 'Full-length framing at chest height, push-in from 4.6 s.',
  location: 'A narrow hallway with grey walls and a light oak floor.',
};

describe('gabarit Replace', () => {
  it('tient dans la limite de MiniMax au pire cas', () => {
    // Analyse à ses plafonds + texte du créateur à SON plafond (avatar et
    // précision comptés ensemble, comme dans l'atelier). Si le gabarit
    // grossit, c'est ici que ça casse — pas chez le fournisseur, après débit.
    const half = Math.floor(REPLACE_CREATOR_MAX / 2);
    const prompt = buildReplacePrompt({
      seconds: 15,
      avatarDescription: 'a'.repeat(half),
      note: 'n'.repeat(REPLACE_CREATOR_MAX - half),
      analysis: {
        character: 'c '.repeat(ANALYSIS_LIMITS.character),
        motion: Array.from({ length: 40 }, (_, i) => `${i}.0–${i + 1}.0 s: ${'m'.repeat(60)}`).join(
          '\n',
        ),
        camera: 'k '.repeat(ANALYSIS_LIMITS.camera),
        location: 'l '.repeat(ANALYSIS_LIMITS.location),
      },
    });
    expect(prompt.length).toBeLessThanOrEqual(REPLACE_PROVIDER_MAX);
  });

  it('annonce au créateur la place que le gabarit lui laisse', () => {
    expect(capabilitiesFor('replace')?.promptMaxLength).toBe(REPLACE_CREATOR_MAX);
  });

  it('insère l’analyse : personnage, mouvement minuté, caméra, lieu', () => {
    const prompt = buildReplacePrompt({ seconds: 6, analysis: ANALYSIS });
    expect(prompt).toContain('THE CHARACTER (identical in every frame): A young woman');
    expect(prompt).toContain('MOTION (follow the reference video exactly, 6 seconds)');
    expect(prompt).toContain('1.8–3.2 s: the character pivots');
    expect(prompt).toContain('CAMERA: Full-length framing');
    expect(prompt).toContain('LOCATION AND LIGHT: A narrow hallway');
  });

  it('retombe sur le gabarit générique sans analyse', () => {
    // Essai réel : sans découpage, le remplacement reste correct — c'est le
    // repli quand Gemini ne répond pas.
    const prompt = buildReplacePrompt({ seconds: 8, analysis: null });
    expect(prompt).toContain('exactly as shown in the reference image');
    expect(prompt).toContain('for the full 8 seconds');
    expect(prompt).toContain('identical to the reference video');
  });

  it('pose les rôles : identité depuis l’image, tout le reste depuis la vidéo', () => {
    const prompt = buildReplacePrompt({ seconds: 6 });
    expect(prompt).toMatch(/Reference video: the source of body motion/);
    expect(prompt).toMatch(/never take the face, hair, skin tone, body or clothing from it/);
    expect(prompt).toMatch(/Reference image: the ONLY source of the character’s identity/);
  });

  it('ajoute la description de l’avatar et la précision du créateur sur une ligne', () => {
    const prompt = buildReplacePrompt({
      seconds: 6,
      avatarDescription: 'Awa, 24 ans,\nrobe wax jaune',
      note: 'elle sourit\n\ndavantage',
    });
    expect(prompt).toContain('Creator’s description of the character: Awa, 24 ans, robe wax jaune');
    expect(prompt).toContain('elle sourit davantage');
  });

  it('ne garde que des lignes de mouvement entières', () => {
    const long = Array.from({ length: 30 }, (_, i) => `${i}.0–${i + 1}.0 s: ${'x'.repeat(50)}`);
    const prompt = buildReplacePrompt({ seconds: 15, analysis: { motion: long.join('\n') } });
    const kept = prompt.split('\n').filter((l) => /^\d+\.0–/.test(l));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(long.length);
    for (const line of kept) expect(long).toContain(line);
  });

  it('montre au créateur sa précision, pas le gabarit', () => {
    expect(replaceDisplayPrompt(buildReplacePrompt({ seconds: 6, note: 'sans le sac' }))).toBe(
      'sans le sac',
    );
    expect(replaceDisplayPrompt(buildReplacePrompt({ seconds: 6 }))).toBe('');
  });

  it('coupe au mot', () => {
    expect(clip('un deux trois quatre', 10)).toBe('un deux');
    expect(clip('court', 10)).toBe('court');
  });
});

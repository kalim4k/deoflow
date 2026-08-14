import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Deux invariants tiennent tout ce module.
 *
 * 1. La génération d'un visage porte `purpose: 'AVATAR'` — c'est ce qui
 *    l'écarte de la galerie. Le filtre est posé côté route, mais il ne sert à
 *    rien si la ligne n'est pas marquée à la création.
 * 2. Un avatar `PENDING` finit toujours par se résoudre à la LECTURE, sans
 *    cron. Un créateur qui ferme son onglet pendant la génération doit
 *    retrouver son avatar prêt, pas bloqué.
 */
const h = vi.hoisted(() => {
  const avatars = new Map<string, Record<string, unknown>>();
  const generations = new Map<string, Record<string, unknown>>();
  const created: Array<Record<string, unknown>> = [];
  const settled: string[] = [];
  return { avatars, generations, created, settled };
});

vi.mock('@/lib/server/prisma', () => {
  const client = {
    avatar: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `av_${h.avatars.size + 1}`;
        const row = { id, faceUrl: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        h.avatars.set(id, row);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const row = h.avatars.get(where.id);
        return row && row.userId === where.userId ? row : null;
      },
      findMany: async ({ where }: { where: { userId: string } }) =>
        [...h.avatars.values()].filter((a) => a.userId === where.userId),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(h.avatars.get(where.id) ?? {}, data),
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const row = h.avatars.get(where.id);
        if (!row || row.userId !== where.userId) return { count: 0 };
        h.avatars.delete(where.id);
        return { count: 1 };
      },
    },
    generation: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        h.generations.get(where.id) ?? null,
    },
  };
  return { prisma: client };
});

vi.mock('@/lib/server/generations/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/generations/service')>();
  return {
    ...actual,
    createGeneration: async (input: Record<string, unknown>) => {
      h.created.push(input);
      const id = `gen_${h.created.length}`;
      const row = { id, status: 'PENDING', assetUrls: null };
      h.generations.set(id, row);
      return row;
    },
    // Le vrai `settleGeneration` interroge kie.ai. Ici on note seulement qu'il a
    // été appelé, et on rend la ligne telle que le test l'a posée : c'est cet
    // appel — pas son contenu — qui est l'invariant.
    settleGeneration: async (row: { id: string }) => {
      h.settled.push(row.id);
      return h.generations.get(row.id) ?? row;
    },
  };
});

import {
  AvatarError,
  createAvatar,
  deleteAvatar,
  getAvatar,
  listAvatars,
  updateAvatar,
} from './service';

const BASE = {
  userId: 'u1',
  name: 'Awa',
  description: 'Jeune femme togolaise, mince, tresses longues',
  modelSlug: 'nano-banana-2',
};

beforeEach(() => {
  h.avatars.clear();
  h.generations.clear();
  h.created.length = 0;
  h.settled.length = 0;
});

describe('création', () => {
  it('marque la génération AVATAR — elle ne doit pas passer par la galerie', async () => {
    await createAvatar(BASE);
    expect(h.created[0]).toMatchObject({ purpose: 'AVATAR' });
  });

  it('impose le gabarit de portrait et le format carré', async () => {
    await createAvatar(BASE);
    const sent = h.created[0] as { prompt: string; ratio: string };
    expect(sent.ratio).toBe('1:1');
    expect(sent.prompt).toMatch(/fond blanc uni/i);
    expect(sent.prompt).toContain(BASE.description);
  });

  it('naît PENDING et pointe sur sa génération', async () => {
    const avatar = await createAvatar(BASE);
    expect(avatar).toMatchObject({ status: 'PENDING', faceUrl: null, faceGenerationId: 'gen_1' });
  });

  it('refuse un modèle qui ne sait pas faire de portrait', async () => {
    await expect(createAvatar({ ...BASE, modelSlug: 'veo-3-1' })).rejects.toMatchObject({
      code: 'AVATAR_MODEL_INVALID',
    });
    // Rien ne doit être facturé sur un refus de validation.
    expect(h.created).toHaveLength(0);
  });

  it('refuse un nom vide', async () => {
    await expect(createAvatar({ ...BASE, name: '   ' })).rejects.toBeInstanceOf(AvatarError);
    expect(h.created).toHaveLength(0);
  });

  it('exige une description quand il n’y a pas de photo', async () => {
    // Sans photo, le texte est la seule matière : un champ vide produirait un
    // visage au hasard, facturé.
    await expect(createAvatar({ ...BASE, description: '' })).rejects.toMatchObject({
      code: 'AVATAR_DESCRIPTION_REQUIRED',
    });
  });

  it('accepte une photo sans description', async () => {
    const avatar = await createAvatar({
      ...BASE,
      description: '',
      photoUrl: 'https://cdn/photo.jpg',
      photoRightsAck: true,
    });
    expect(avatar.status).toBe('PENDING');
    expect(h.created[0]).toMatchObject({ mode: 'image' });
  });

  it('exige la déclaration de droits sur une photo', async () => {
    await expect(
      createAvatar({ ...BASE, photoUrl: 'https://cdn/photo.jpg', photoRightsAck: false }),
    ).rejects.toMatchObject({ code: 'PHOTO_RIGHTS_REQUIRED' });
    expect(h.created).toHaveLength(0);
  });

  it('place la photo dans l’emplacement du modèle choisi', async () => {
    await createAvatar({
      ...BASE,
      modelSlug: 'gpt-image-2',
      photoUrl: 'https://cdn/p.jpg',
      photoRightsAck: true,
    });
    expect(h.created[0]).toMatchObject({ media: { input_urls: ['https://cdn/p.jpg'] } });

    await createAvatar({ ...BASE, photoUrl: 'https://cdn/p.jpg', photoRightsAck: true });
    expect(h.created[1]).toMatchObject({ media: { image_input: ['https://cdn/p.jpg'] } });
  });
});

describe('résolution paresseuse', () => {
  /**
   * LA régression à ne plus jamais laisser passer.
   *
   * Une génération ne devient `SUCCEEDED` que si quelqu'un interroge kie.ai et
   * recopie le résultat. Les écrans d'avatar ne sondent que `/api/avatars` :
   * si `resolve()` se contente de LIRE le statut, il attend un état que
   * personne n'écrit. L'avatar tourne indéfiniment alors que l'image existe —
   * et a été facturée.
   */
  it('RÈGLE la génération au lieu de se contenter de lire son statut', async () => {
    await createAvatar(BASE);
    h.generations.set('gen_1', { id: 'gen_1', status: 'RUNNING', assetUrls: null });

    await listAvatars('u1');
    expect(h.settled).toContain('gen_1');
  });

  it('ne rappelle pas le fournisseur pour un avatar déjà résolu', async () => {
    const avatar = await createAvatar(BASE);
    h.generations.set('gen_1', {
      id: 'gen_1',
      status: 'SUCCEEDED',
      assetUrls: ['https://cdn/face.png'],
    });

    await listAvatars('u1');
    h.settled.length = 0;

    // L'avatar est READY : plus rien à régler, donc plus aucun appel — sans quoi
    // le sondage toutes les 4 s de l'écran deviendrait un appel réseau par
    // avatar et par tick.
    await listAvatars('u1');
    expect(h.settled).toHaveLength(0);
    expect(h.avatars.get(avatar.id)).toMatchObject({ status: 'READY' });
  });

  it('passe READY quand la génération a abouti', async () => {
    const avatar = await createAvatar(BASE);
    // Le créateur a fermé son onglet ; la génération a fini sans lui.
    h.generations.set('gen_1', {
      id: 'gen_1',
      status: 'SUCCEEDED',
      assetUrls: ['https://cdn/face.png'],
    });

    const [resolved] = await listAvatars('u1');
    expect(resolved).toMatchObject({ status: 'READY', faceUrl: 'https://cdn/face.png' });
    // L'état est PERSISTÉ, pas seulement calculé à l'affichage.
    expect(h.avatars.get(avatar.id)).toMatchObject({ status: 'READY' });
  });

  it('passe FAILED quand la génération a échoué', async () => {
    await createAvatar(BASE);
    h.generations.set('gen_1', { id: 'gen_1', status: 'FAILED', assetUrls: null });
    expect((await listAvatars('u1'))[0]?.status).toBe('FAILED');
  });

  it('passe FAILED plutôt que de rester bloqué si la génération a disparu', async () => {
    await createAvatar(BASE);
    h.generations.delete('gen_1');
    expect((await listAvatars('u1'))[0]?.status).toBe('FAILED');
  });

  it('passe FAILED si la génération a réussi sans image', async () => {
    await createAvatar(BASE);
    h.generations.set('gen_1', { id: 'gen_1', status: 'SUCCEEDED', assetUrls: [] });
    expect((await listAvatars('u1'))[0]?.status).toBe('FAILED');
  });

  it('reste PENDING tant que la génération court', async () => {
    await createAvatar(BASE);
    h.generations.set('gen_1', { id: 'gen_1', status: 'RUNNING', assetUrls: null });
    expect((await listAvatars('u1'))[0]?.status).toBe('PENDING');
  });
});

describe('lecture et modification', () => {
  it('l’avatar d’un autre est INTROUVABLE, pas interdit', async () => {
    const avatar = await createAvatar(BASE);
    await expect(getAvatar('u2', avatar.id)).rejects.toMatchObject({
      code: 'AVATAR_NOT_FOUND',
      status: 404,
    });
  });

  it('modifier le texte ne relance AUCUNE génération', async () => {
    const avatar = await createAvatar(BASE);
    h.created.length = 0;

    const updated = await updateAvatar('u1', avatar.id, {
      name: 'Awa 2',
      description: 'plus âgée',
    });

    expect(updated).toMatchObject({ name: 'Awa 2', description: 'plus âgée' });
    // C'est la promesse faite au créateur : corriger un texte est gratuit.
    expect(h.created).toHaveLength(0);
  });

  it('refuse de vider le nom', async () => {
    const avatar = await createAvatar(BASE);
    await expect(updateAvatar('u1', avatar.id, { name: '  ' })).rejects.toMatchObject({
      code: 'AVATAR_NAME_REQUIRED',
    });
  });

  it('supprimer l’avatar d’un autre échoue', async () => {
    const avatar = await createAvatar(BASE);
    await expect(deleteAvatar('u2', avatar.id)).rejects.toMatchObject({ status: 404 });
    expect(h.avatars.size).toBe(1);
  });

  it('supprime le sien', async () => {
    const avatar = await createAvatar(BASE);
    await deleteAvatar('u1', avatar.id);
    expect(h.avatars.size).toBe(0);
  });
});

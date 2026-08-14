// POST + GET /api/avatars.
import '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

const { createAvatarMock, listAvatarsMock } = vi.hoisted(() => ({
  createAvatarMock: vi.fn(),
  listAvatarsMock: vi.fn(),
}));
vi.mock('@/lib/server/avatars/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/avatars/service')>();
  return { ...actual, createAvatar: createAvatarMock, listAvatars: listAvatarsMock };
});

import { requireAuth } from '@/lib/server/middleware';
import { AvatarError } from '@/lib/server/avatars/service';
import { InsufficientCreditsError } from '@/lib/server/credits';
import { GET, POST } from './route';

const AVATAR = {
  id: 'av_1',
  name: 'Awa',
  description: 'Jeune femme togolaise',
  faceUrl: null,
  modelSlug: 'nano-banana-2',
  status: 'PENDING',
  faceGenerationId: 'gen_1',
  createdAt: '2026-08-13T10:00:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
};

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if ((opts.csrf ?? 'match') === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/avatars', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const VALID = { name: 'Awa', description: 'Jeune femme togolaise', modelSlug: 'nano-banana-2' };

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
  createAvatarMock.mockResolvedValue(AVATAR);
  listAvatarsMock.mockResolvedValue([AVATAR]);
});

describe('POST /api/avatars', () => {
  it('crée l’avatar et renvoie 201', async () => {
    const res = await POST(makePost(VALID));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: 'av_1', status: 'PENDING' });
  });

  it('exige le jeton CSRF', async () => {
    const res = await POST(makePost(VALID, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(createAvatarMock).not.toHaveBeenCalled();
  });

  it('n’accepte pas qu’on lui dicte le `purpose`', async () => {
    // Sinon n'importe qui masquerait ses propres générations de la galerie.
    await POST(makePost({ ...VALID, purpose: 'CREATION' }));
    expect(createAvatarMock.mock.calls[0]?.[0]).not.toHaveProperty('purpose');
  });

  it('refuse un corps sans nom', async () => {
    const res = await POST(makePost({ description: 'x', modelSlug: 'nano-banana-2' }));
    expect(res.status).toBe(400);
    expect(createAvatarMock).not.toHaveBeenCalled();
  });

  it('traduit un solde insuffisant en 402, pas en 500', async () => {
    // Créer un avatar EST une génération : le solde peut manquer, et ce chemin
    // n'existait pas avant cette route.
    createAvatarMock.mockRejectedValue(new InsufficientCreditsError(24, 10));
    const res = await POST(makePost(VALID));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({
      error: 'INSUFFICIENT_CREDITS',
      required: 24,
      available: 10,
    });
  });

  it('traduit une erreur d’avatar en code stable', async () => {
    createAvatarMock.mockRejectedValue(
      new AvatarError('PHOTO_RIGHTS_REQUIRED', 'Confirmez les droits', 400),
    );
    const res = await POST(makePost(VALID));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'PHOTO_RIGHTS_REQUIRED' });
  });
});

describe('GET /api/avatars', () => {
  it('liste les avatars du créateur', async () => {
    const res = await GET(new NextRequest('http://test/api/avatars'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ items: [{ id: 'av_1' }] });
    expect(listAvatarsMock).toHaveBeenCalledWith('u1');
  });

  it('exige une session', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) as never,
    );
    expect((await GET(new NextRequest('http://test/api/avatars'))).status).toBe(401);
  });
});

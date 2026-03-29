import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

export type AuthUser = {
  userId: string;
  storeId: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export type JwtPayload = {
  sub: string;
  storeId: string;
  email: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async findOrCreateGoogleUser(profile: {
    googleId: string;
    email?: string;
    name?: string;
    picture?: string;
  }): Promise<AuthUser> {
    const email = profile.email?.toLowerCase();
    if (!email) {
      throw new UnauthorizedException(
        'Google did not return an email for this account',
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: { googleId: profile.googleId },
    });
    if (existing) {
      return this.toAuthUser(existing);
    }

    const seedEmail = process.env.SEED_ATTACH_EMAIL?.toLowerCase();
    const seedStoreId = process.env.SEED_STORE_ID ?? 'seed_store_demo_001';
    if (seedEmail && email === seedEmail) {
      const seededStore = await this.prisma.store.findUnique({
        where: { id: seedStoreId },
      });
      if (seededStore) {
        const user = await this.prisma.user.create({
          data: {
            email,
            googleId: profile.googleId,
            name: profile.name ?? null,
            picture: profile.picture ?? null,
            storeId: seededStore.id,
          },
        });
        return this.toAuthUser(user);
      }
    }

    const store = await this.prisma.store.create({
      data: { name: `${profile.name ?? email}'s store` },
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        googleId: profile.googleId,
        name: profile.name ?? null,
        picture: profile.picture ?? null,
        storeId: store.id,
      },
    });

    return this.toAuthUser(user);
  }

  signAccessToken(user: AuthUser): string {
    const payload: JwtPayload = {
      sub: user.userId,
      storeId: user.storeId,
      email: user.email,
    };
    return this.jwtService.sign(payload);
  }

  private toAuthUser(user: {
    id: string;
    storeId: string;
    email: string;
    name: string | null;
    picture: string | null;
  }): AuthUser {
    return {
      userId: user.id,
      storeId: user.storeId,
      email: user.email,
      name: user.name,
      picture: user.picture,
    };
  }
}

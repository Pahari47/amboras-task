import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { AuthService, AuthUser } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<AuthUser> {
    const googleId = profile.id;
    const email = profile.emails?.[0]?.value;
    const joined = [profile.name?.givenName, profile.name?.familyName]
      .filter(Boolean)
      .join(' ');
    const name = profile.displayName ?? (joined || undefined);
    const picture = profile.photos?.[0]?.value;

    return this.authService.findOrCreateGoogleUser({
      googleId,
      email,
      name,
      picture,
    });
  }
}

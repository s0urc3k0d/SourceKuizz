import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { loginDto, registerDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: any) {
    try {
      // simple trace (sera éventuellement retirée)
      // console.log('Register endpoint hit');
      const parsed = registerDto.parse(body);
      return this.auth.register(parsed.username, parsed.password);
    } catch (e: any) {
      if (e.name === 'ZodError') throw new BadRequestException(e.errors);
      throw e;
    }
  }

  @Post('login')
  async login(@Body() body: any) {
    try {
      const parsed = loginDto.parse(body);
      return this.auth.login(parsed.username, parsed.password);
    } catch (e: any) {
      if (e.name === 'ZodError') throw new BadRequestException(e.errors);
      throw e;
    }
  }

  @Post('refresh')
  async refresh(@Body() body: any) {
    if (!body?.refreshToken) throw new BadRequestException('missing_refresh_token');
    return this.auth.refresh(body.refreshToken);
  }
}

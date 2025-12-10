import { Body, Controller, Get, Post, UseGuards, Param, Patch, Delete, Query } from '@nestjs/common';
import { QuizService, quizCreateDto, quizUpdateDto, paginationDto } from './quiz.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../types';

@Controller('quizzes')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private quiz: QuizService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const data = quizCreateDto.parse(body);
    return this.quiz.create(user.id, data);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string>) {
    const pagination = paginationDto.safeParse(query);
    return this.quiz.list(user.id, pagination.success ? pagination.data : undefined);
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.quiz.get(user.id, id);
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const patch = quizUpdateDto.parse(body);
    return this.quiz.update(user.id, id, patch);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.quiz.remove(user.id, id);
  }
}

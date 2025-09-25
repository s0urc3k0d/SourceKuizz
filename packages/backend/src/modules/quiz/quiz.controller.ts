import { Body, Controller, Get, Post, UseGuards, Param, Patch, Delete } from '@nestjs/common';
import { QuizService, quizCreateDto, quizUpdateDto } from './quiz.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('quizzes')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private quiz: QuizService) {}

  @Post()
  async create(@CurrentUser() user: any, @Body() body: any) {
    const data = quizCreateDto.parse(body);
    return this.quiz.create(user.id, data);
  }

  @Get()
  async list(@CurrentUser() user: any) {
    return this.quiz.list(user.id);
  }

  @Get(':id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quiz.get(user.id, id);
  }

  @Patch(':id')
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    const patch = quizUpdateDto.parse(body);
    return this.quiz.update(user.id, id, patch);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quiz.remove(user.id, id);
  }
}

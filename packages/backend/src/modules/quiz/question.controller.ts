import { Body, Controller, Get, Post, UseGuards, Param, Patch, Delete } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { QuestionService } from './question.service';
import { createQuestionDto, updateQuestionDto } from './question.dto';

@Controller('quizzes/:quizId/questions')
@UseGuards(JwtAuthGuard)
export class QuestionController {
  constructor(private qs: QuestionService) {}

  @Post()
  async create(@CurrentUser() user: any, @Param('quizId') quizId: string, @Body() body: any) {
    const data = createQuestionDto.parse(body);
    return this.qs.create(quizId, user.id, data);
  }

  @Get()
  async list(@CurrentUser() user: any, @Param('quizId') quizId: string) {
    return this.qs.list(quizId, user.id);
  }

  @Patch(':id')
  async update(@CurrentUser() user: any, @Param('quizId') quizId: string, @Param('id') id: string, @Body() body: any) {
    const patch = updateQuestionDto.parse(body);
    return this.qs.update(quizId, id, user.id, patch);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: any, @Param('quizId') quizId: string, @Param('id') id: string) {
    return this.qs.remove(quizId, id, user.id);
  }
}

import { QuestionItem } from '@/types/page';

export function sortQuestions(items: QuestionItem[] = []): QuestionItem[] {
  return [...items].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

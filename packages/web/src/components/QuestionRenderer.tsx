import { useState } from 'react';

export type QuestionType = 'multiple_choice' | 'true_false' | 'text_input' | 'ordering';

interface QuestionOption {
  id: string;
  label: string;
  isCorrect?: boolean;
  orderIndex?: number;
}

interface BaseQuestionProps {
  questionId: string;
  prompt: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'audio' | null;
  timeLimitMs: number;
  disabled?: boolean;
  onSubmit: (answer: SubmitAnswerPayload) => void;
}

interface SubmitAnswerPayload {
  questionId: string;
  optionId?: string;
  textAnswer?: string;
  orderedOptionIds?: string[];
  clientTs: number;
}

// ================= MULTIPLE CHOICE =================
interface MultipleChoiceProps extends BaseQuestionProps {
  options: QuestionOption[];
}

export function MultipleChoiceQuestion({
  questionId,
  prompt,
  mediaUrl,
  mediaType,
  options,
  disabled,
  onSubmit,
}: MultipleChoiceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (optionId: string) => {
    if (disabled || selectedId) return;
    setSelectedId(optionId);
    onSubmit({
      questionId,
      optionId,
      clientTs: Date.now(),
    });
  };

  return (
    <div className="space-y-4">
      <QuestionMedia url={mediaUrl} type={mediaType} />
      <h2 className="text-xl font-bold text-white">{prompt}</h2>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt, idx) => (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            disabled={disabled || !!selectedId}
            className={`p-4 rounded-lg text-lg font-medium transition-all ${
              selectedId === opt.id
                ? 'bg-indigo-600 text-white ring-4 ring-indigo-400'
                : selectedId
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            } ${getOptionColor(idx)}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ================= TRUE/FALSE =================
interface TrueFalseProps extends BaseQuestionProps {
  options: QuestionOption[];
}

export function TrueFalseQuestion({
  questionId,
  prompt,
  mediaUrl,
  mediaType,
  options,
  disabled,
  onSubmit,
}: TrueFalseProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (optionId: string) => {
    if (disabled || selectedId) return;
    setSelectedId(optionId);
    onSubmit({
      questionId,
      optionId,
      clientTs: Date.now(),
    });
  };

  const vraiOption = options.find(o => o.label === 'Vrai');
  const fauxOption = options.find(o => o.label === 'Faux');

  return (
    <div className="space-y-4">
      <QuestionMedia url={mediaUrl} type={mediaType} />
      <h2 className="text-xl font-bold text-white">{prompt}</h2>
      <div className="flex gap-4 justify-center">
        {vraiOption && (
          <button
            onClick={() => handleSelect(vraiOption.id)}
            disabled={disabled || !!selectedId}
            className={`px-12 py-6 rounded-xl text-2xl font-bold transition-all ${
              selectedId === vraiOption.id
                ? 'bg-green-600 text-white ring-4 ring-green-400'
                : selectedId
                ? 'bg-gray-700 text-gray-400'
                : 'bg-green-700 text-white hover:bg-green-600'
            }`}
          >
            ✓ Vrai
          </button>
        )}
        {fauxOption && (
          <button
            onClick={() => handleSelect(fauxOption.id)}
            disabled={disabled || !!selectedId}
            className={`px-12 py-6 rounded-xl text-2xl font-bold transition-all ${
              selectedId === fauxOption.id
                ? 'bg-red-600 text-white ring-4 ring-red-400'
                : selectedId
                ? 'bg-gray-700 text-gray-400'
                : 'bg-red-700 text-white hover:bg-red-600'
            }`}
          >
            ✗ Faux
          </button>
        )}
      </div>
    </div>
  );
}

// ================= TEXT INPUT =================
interface TextInputProps extends BaseQuestionProps {}

export function TextInputQuestion({
  questionId,
  prompt,
  mediaUrl,
  mediaType,
  disabled,
  onSubmit,
}: TextInputProps) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || submitted || !answer.trim()) return;
    setSubmitted(true);
    onSubmit({
      questionId,
      textAnswer: answer.trim(),
      clientTs: Date.now(),
    });
  };

  return (
    <div className="space-y-4">
      <QuestionMedia url={mediaUrl} type={mediaType} />
      <h2 className="text-xl font-bold text-white">{prompt}</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={disabled || submitted}
          placeholder="Tapez votre réponse..."
          className={`w-full px-4 py-3 rounded-lg text-lg ${
            submitted
              ? 'bg-gray-700 text-gray-400'
              : 'bg-gray-700 text-white focus:ring-2 focus:ring-indigo-500'
          }`}
          autoFocus
        />
        <button
          type="submit"
          disabled={disabled || submitted || !answer.trim()}
          className={`w-full py-3 rounded-lg text-lg font-bold transition-all ${
            submitted
              ? 'bg-indigo-800 text-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
        >
          {submitted ? '✓ Réponse envoyée' : 'Envoyer'}
        </button>
      </form>
    </div>
  );
}

// ================= ORDERING =================
interface OrderingProps extends BaseQuestionProps {
  options: QuestionOption[];
}

export function OrderingQuestion({
  questionId,
  prompt,
  mediaUrl,
  mediaType,
  options,
  disabled,
  onSubmit,
}: OrderingProps) {
  const [items, setItems] = useState<QuestionOption[]>(() => 
    shuffleArray([...options])
  );
  const [submitted, setSubmitted] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newItems = [...items];
    const draggedItem = newItems[draggedIndex];
    newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, draggedItem);
    setItems(newItems);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (submitted) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    
    const newItems = [...items];
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
    setItems(newItems);
  };

  const handleSubmit = () => {
    if (disabled || submitted) return;
    setSubmitted(true);
    onSubmit({
      questionId,
      orderedOptionIds: items.map(item => item.id),
      clientTs: Date.now(),
    });
  };

  return (
    <div className="space-y-4">
      <QuestionMedia url={mediaUrl} type={mediaType} />
      <h2 className="text-xl font-bold text-white">{prompt}</h2>
      <p className="text-gray-400 text-sm">Glissez-déposez ou utilisez les flèches pour réordonner</p>
      
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            draggable={!submitted}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-3 p-4 rounded-lg ${
              submitted
                ? 'bg-gray-700 text-gray-400'
                : 'bg-gray-700 text-white cursor-grab active:cursor-grabbing'
            } ${draggedIndex === index ? 'opacity-50' : ''}`}
          >
            <span className="text-gray-500 font-mono">{index + 1}.</span>
            <span className="flex-1">{item.label}</span>
            {!submitted && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveItem(index, 'up')}
                  disabled={index === 0}
                  className="px-2 py-1 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveItem(index, 'down')}
                  disabled={index === items.length - 1}
                  className="px-2 py-1 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={disabled || submitted}
        className={`w-full py-3 rounded-lg text-lg font-bold transition-all ${
          submitted
            ? 'bg-indigo-800 text-gray-400 cursor-not-allowed'
            : 'bg-indigo-600 text-white hover:bg-indigo-500'
        }`}
      >
        {submitted ? '✓ Réponse envoyée' : 'Valider l\'ordre'}
      </button>
    </div>
  );
}

// ================= MEDIA COMPONENT =================
interface QuestionMediaProps {
  url?: string | null;
  type?: 'image' | 'video' | 'audio' | null;
}

function QuestionMedia({ url, type }: QuestionMediaProps) {
  if (!url) return null;

  switch (type) {
    case 'image':
      return (
        <div className="mb-4 rounded-lg overflow-hidden">
          <img
            src={url}
            alt="Question media"
            className="w-full max-h-64 object-contain bg-gray-800"
          />
        </div>
      );
    case 'video':
      return (
        <div className="mb-4 rounded-lg overflow-hidden">
          <video
            src={url}
            controls
            className="w-full max-h-64 bg-gray-800"
          />
        </div>
      );
    case 'audio':
      return (
        <div className="mb-4">
          <audio src={url} controls className="w-full" />
        </div>
      );
    default:
      // Essayer de deviner le type
      if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        return (
          <div className="mb-4 rounded-lg overflow-hidden">
            <img
              src={url}
              alt="Question media"
              className="w-full max-h-64 object-contain bg-gray-800"
            />
          </div>
        );
      }
      return null;
  }
}

// ================= UTILITIES =================
function getOptionColor(index: number): string {
  const colors = [
    'border-l-4 border-red-500',
    'border-l-4 border-blue-500',
    'border-l-4 border-yellow-500',
    'border-l-4 border-green-500',
  ];
  return colors[index % colors.length];
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ================= MAIN COMPONENT =================
interface QuestionRendererProps {
  type: QuestionType;
  questionId: string;
  prompt: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'audio' | null;
  options?: QuestionOption[];
  timeLimitMs: number;
  disabled?: boolean;
  onSubmit: (answer: SubmitAnswerPayload) => void;
}

export default function QuestionRenderer({
  type,
  questionId,
  prompt,
  mediaUrl,
  mediaType,
  options = [],
  timeLimitMs,
  disabled,
  onSubmit,
}: QuestionRendererProps) {
  const baseProps = {
    questionId,
    prompt,
    mediaUrl,
    mediaType,
    timeLimitMs,
    disabled,
    onSubmit,
  };

  switch (type) {
    case 'true_false':
      return <TrueFalseQuestion {...baseProps} options={options} />;
    case 'text_input':
      return <TextInputQuestion {...baseProps} />;
    case 'ordering':
      return <OrderingQuestion {...baseProps} options={options} />;
    case 'multiple_choice':
    default:
      return <MultipleChoiceQuestion {...baseProps} options={options} />;
  }
}

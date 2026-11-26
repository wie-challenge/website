'use client';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Send, X } from 'lucide-react';
import {
  nasoujCopy,
  nasoujReply,
  nasoujTopics,
  type NasoujLocale,
  type NasoujRole,
} from './nasouj-demo-replies';
import type { AssistantChat } from '@nasj/contracts';
import { streamAssistant } from '@/lib/assistant-stream';
import { nasoujArt } from './nasouj-assets';

type Message = {
  id: number;
  from: 'user' | 'nasouj';
  text: string;
  complete?: boolean;
  guide?: boolean;
};

const locales: { id: NasoujLocale; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'fr', label: 'FR', name: 'Français' },
  { id: 'ar', label: 'ع', name: 'العربية' },
];
const supportLabel: Record<NasoujLocale, string> = {
  en: 'Talk to a person',
  fr: 'Parler à une personne',
  ar: 'التحدث إلى شخص',
};
const errorCopy: Record<NasoujLocale, string> = {
  en: 'Nasouj could not complete this reply. Please try again or contact support.',
  fr: 'Nasouj ne peut pas terminer cette réponse. Réessayez ou contactez le support.',
  ar: 'تعذر على نسوج إكمال الرد. يرجى المحاولة مجددا أو التواصل مع الدعم.',
};
const feedbackCopy = {
  en: { note: 'Feedback stays in this session', helpful: 'Helpful', unhelpful: 'Unhelpful' },
  fr: { note: 'Avis conservé pour cette session', helpful: 'Utile', unhelpful: 'Inutile' },
  ar: { note: 'يبقى التقييم في هذه الجلسة', helpful: 'مفيد', unhelpful: 'غير مفيد' },
};
const guideCopy = { en: 'Built-in guide', fr: 'Guide intégré', ar: 'دليل مدمج' };
const incompleteCopy = { en: 'Incomplete reply', fr: 'Réponse incomplète', ar: 'رد غير مكتمل' };
const clearCopy = { en: 'Clear conversation', fr: 'Effacer la conversation', ar: 'مسح المحادثة' };

export function NasoujWidget({ role }: { role: NasoujRole }) {
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<NasoujLocale>('en');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'idle' | 'thinking' | 'answering'>('idle');
  const nextId = useRef(1);
  const active = useRef<AbortController | null>(null);
  const history = useRef<AssistantChat['messages']>([]);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const log = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  });
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function cancel() {
    active.current?.abort();
    active.current = null;
    setState('idle');
  }
  function close() {
    cancel();
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }
  function clear() {
    cancel();
    history.current = [];
    setMessages([]);
    setFeedback({});
    setError('');
    input.current?.focus();
  }
  async function ask(question: string) {
    const text = question.trim();
    if (!text || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setDraft('');
    setError('');
    const userId = nextId.current++;
    const id = nextId.current++;
    setMessages((current) => [
      ...current,
      { id: userId, from: 'user', text },
      { id, from: 'nasouj', text: '', complete: false },
    ]);
    setState('thinking');
    // Only successful turns enter context; discarded/failed partial replies remain display-only.
    let context = history.current.slice(-8);
    while (context.reduce((n, m) => n + m.content.length, 0) + text.length > 16000)
      context = context.slice(2);
    const request: AssistantChat = {
      language: locale,
      messages: [...context, { role: 'user', content: text }],
    };
    let answer = '';
    try {
      await streamAssistant(request, controller.signal, (delta) => {
        if (active.current !== controller) return;
        answer += delta;
        setState('answering');
        setMessages((current) => current.map((m) => (m.id === id ? { ...m, text: answer } : m)));
      });
      if (active.current === controller) {
        setMessages((current) => current.map((m) => (m.id === id ? { ...m, complete: true } : m)));
        history.current = [
          ...request.messages,
          { role: 'assistant', content: answer.slice(0, 2000) },
        ];
      }
    } catch (cause) {
      if (!controller.signal.aborted && active.current === controller) {
        if (cause instanceof Error && cause.message === 'ASSISTANT_GUIDE_FALLBACK') {
          const guide = nasoujReply(role, locale, text);
          setMessages((current) =>
            current.map((m) =>
              m.id === id ? { ...m, text: guide, complete: true, guide: true } : m,
            ),
          );
        } else {
          setError(errorCopy[locale]);
        }
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setState('idle');
      }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    ask(draft);
  }

  if (!open)
    return (
      <button
        ref={launcher}
        type="button"
        className="nasouj-launcher"
        onClick={() => setOpen(true)}
        aria-label="Open Nasouj assistant"
      >
        <Image src={nasoujArt.poses.wave} alt="" width={72} height={97} />
        <span>Nasouj</span>
      </button>
    );

  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return (
    <section
      className="nasouj-panel"
      aria-label="Nasouj assistant"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <header className="nasouj-panel-header">
        <Image src={nasoujArt.avatar} alt="" width={40} height={40} />
        <div className="nasouj-panel-title">
          <strong>Nasouj</strong>
          <span>{nasoujCopy.preview[locale]}</span>
        </div>
        <fieldset className="nasouj-locales">
          <legend className="sr-only">Language</legend>
          {locales.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.name}
              aria-pressed={locale === item.id}
              onClick={() => setLocale(item.id)}
            >
              {item.label}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="nasouj-close"
          onClick={close}
          aria-label={nasoujCopy.close[locale]}
        >
          <X aria-hidden="true" size={18} />
        </button>
      </header>
      <button className="nasouj-clear" type="button" onClick={clear}>
        {clearCopy[locale]}
      </button>
      <div className="nasouj-log" ref={log} role="log" aria-live="polite" dir={dir} lang={locale}>
        <div className="nasouj-welcome">
          <Image
            src={state === 'thinking' ? nasoujArt.poses.thinking : nasoujArt.poses.wave}
            alt=""
            width={72}
            height={97}
          />
          <p className="nasouj-bubble nasouj-from-nasouj">{nasoujCopy.greeting[locale]}</p>
        </div>
        {messages.map((message) => (
          <div key={message.id} className="nasouj-message">
            <p className={`nasouj-bubble nasouj-from-${message.from}`}>{message.text}</p>
            {message.guide && <small>{guideCopy[locale]}</small>}
            {message.complete === false && state === 'idle' && (
              <small>{incompleteCopy[locale]}</small>
            )}
            {message.from === 'nasouj' && message.complete && state === 'idle' && (
              <fieldset className="nasouj-feedback">
                <legend>{feedbackCopy[locale].note}</legend>
                {[feedbackCopy[locale].helpful, feedbackCopy[locale].unhelpful].map((label) => (
                  <button
                    key={label}
                    className="nasouj-feedback-choice"
                    type="button"
                    aria-pressed={feedback[message.id] === label}
                    onClick={() => setFeedback((current) => ({ ...current, [message.id]: label }))}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
            )}
          </div>
        ))}
        {state === 'thinking' && (
          <p className="nasouj-bubble nasouj-from-nasouj nasouj-typing">
            <i />
            <i />
            <i />
            <span className="sr-only">Nasouj is typing</span>
          </p>
        )}
      </div>
      {error && (
        <p className="nasouj-error" role="alert" dir={dir} lang={locale}>
          {error}
        </p>
      )}
      <div className="nasouj-suggestions" dir={dir} lang={locale}>
        {nasoujTopics[role].map((topic) => (
          <button
            key={topic.question.en}
            type="button"
            disabled={state !== 'idle'}
            onClick={() => ask(topic.question[locale])}
          >
            {topic.question[locale]}
          </button>
        ))}
      </div>
      <form className="nasouj-form" onSubmit={submit} dir={dir} lang={locale}>
        <input
          ref={input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={nasoujCopy.placeholder[locale]}
          aria-label={nasoujCopy.placeholder[locale]}
          maxLength={500}
          dir="auto"
        />
        <button
          type="submit"
          disabled={!draft.trim() || state !== 'idle'}
          aria-label={nasoujCopy.send[locale]}
        >
          <Send aria-hidden="true" size={18} />
        </button>
      </form>
      <Link className="nasouj-support" href="/support/cases" dir={dir} lang={locale}>
        {supportLabel[locale]}
      </Link>
    </section>
  );
}

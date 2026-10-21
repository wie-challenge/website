'use client';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useTransition,
  useRef,
  useId,
} from 'react';
import type { ReactNode, FormEvent } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import Link from 'next/link';
import { useHydrated } from '@/lib/use-hydrated';
import { Button } from './ui/button';
import { Input as ShadcnInput } from './ui/input';
import { Label } from './ui/label';
import { NativeSelect } from './ui/native-select';
import { Alert, AlertDescription } from './ui/alert';
import { CircleCheck, LoaderCircle } from 'lucide-react';

const FieldErrors = createContext<Record<string, string[]>>({});
export function useFieldError(name: string) {
  return useContext(FieldErrors)[name] ?? [];
}

export function useResource<T>(path: string) {
  const [result, setResult] = useState<{ path: string; value: T } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settledPath, setSettledPath] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const version = useRef(0);
  const reload = useCallback(async () => {
    const requestVersion = ++version.current;
    setLoading(true);
    setError('');
    setNeedsMfa(false);
    try {
      const value = await apiFetch<T>(path);
      if (requestVersion === version.current) setResult({ path, value });
    } catch (failure) {
      if (requestVersion === version.current) {
        setResult(null);
        setNeedsMfa(failure instanceof ApiError && failure.detail.code === 'MFA_REQUIRED');
        setError(failure instanceof Error ? failure.message : 'Unable to load this workspace.');
      }
    } finally {
      if (requestVersion === version.current) {
        setSettledPath(path);
        setLoading(false);
      }
    }
  }, [path]);
  useEffect(() => {
    void reload();
    return () => {
      ++version.current;
    };
  }, [reload]);
  return {
    data: result?.path === path ? result.value : null,
    error: settledPath === path ? error : '',
    loading: loading || settledPath !== path,
    reload,
    needsMfa: settledPath === path && needsMfa,
  };
}
const FeedbackContext = createContext<((message: string) => void) | null>(null);

export function Workspace({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [feedback, setFeedback] = useState('');
  return (
    <FeedbackContext.Provider value={setFeedback}>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p className="lead">{description}</p>
        </div>
      </div>
      {feedback && (
        <Alert className="notice success" role="status">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      )}
      {children}
    </FeedbackContext.Provider>
  );
}
export function ResourceState({
  loading,
  error,
  retry,
  needsMfa = false,
}: {
  loading: boolean;
  error: string;
  retry: () => unknown;
  needsMfa?: boolean;
}) {
  return loading ? (
    <p className="resource-loading" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      Loading workspace…
    </p>
  ) : error ? (
    <div className="notice" role="alert">
      <p>{error}</p>
      {needsMfa && (
        <p>
          <Link href="/settings/security">Set up or verify two-factor authentication</Link>
        </p>
      )}
      <Button variant="outline" type="button" onClick={retry}>
        Try again
      </Button>
    </div>
  ) : null;
}
export function ActionForm({
  children,
  action,
  label,
  confirm,
  onSuccess,
  className,
  successMessage = 'Saved successfully.',
}: {
  children?: ReactNode;
  action: (data: FormData) => Promise<unknown>;
  label: string;
  confirm?: string;
  onSuccess?: () => unknown;
  className?: string;
  successMessage?: string;
}) {
  const ready = useHydrated();
  const feedback = useContext(FeedbackContext);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const data = new FormData(event.currentTarget);
    setError('');
    setFieldErrors({});
    setMessage('');
    setNeedsMfa(false);
    feedback?.('');
    start(async () => {
      try {
        await action(data);
        await onSuccess?.();
        if (feedback) feedback(successMessage);
        else setMessage(successMessage);
      } catch (failure) {
        setNeedsMfa(failure instanceof ApiError && failure.detail.code === 'MFA_REQUIRED');
        setFieldErrors(failure instanceof ApiError ? (failure.detail.fieldErrors ?? {}) : {});
        setError(failure instanceof Error ? failure.message : 'Unable to save. Please try again.');
      }
    });
  }
  return (
    <form method="post" onSubmit={submit} className={className}>
      <FieldErrors.Provider value={fieldErrors}>
        <fieldset disabled={pending || !ready} aria-busy={pending}>
          {children}
          <Button type="submit" className="action-submit">
            {pending ? 'Saving…' : label}
          </Button>
        </fieldset>
      </FieldErrors.Provider>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
          {needsMfa && (
            <>
              {' '}
              <Link href="/settings/security">Set up two-factor authentication</Link>.
            </>
          )}
        </p>
      )}
    </form>
  );
}
export function Input({
  name,
  label,
  value,
  type = 'text',
  required = false,
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  value?: string | number | null;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
}) {
  const id = useId();
  const errors = useFieldError(name);
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <ShadcnInput
        id={id}
        aria-invalid={errors.length ? true : undefined}
        aria-describedby={errors.length ? `${id}-error` : undefined}
        name={name}
        defaultValue={value ?? ''}
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
      />
      {errors.length > 0 && (
        <p id={`${id}-error`} className="field-error">
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}
export function Select({
  name,
  label,
  value,
  options,
  required = false,
}: {
  name: string;
  label: string;
  value?: string;
  options: readonly string[] | readonly { value: string; label: string }[];
  required?: boolean;
}) {
  const id = useId();
  const errors = useFieldError(name);
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        aria-label={label}
        aria-invalid={errors.length ? true : undefined}
        aria-describedby={errors.length ? `${id}-error` : undefined}
        name={name}
        defaultValue={value}
        required={required}
      >
        {options.map((item) =>
          typeof item === 'string' ? (
            <option key={item} value={item}>
              {humanize(item)}
            </option>
          ) : (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ),
        )}
      </NativeSelect>
      {errors.length > 0 && (
        <p id={`${id}-error`} className="field-error">
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}
export function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
export function text(data: FormData, name: string) {
  return String(data.get(name) ?? '').trim();
}
export function Checkboxes({
  name,
  options,
  selected = [],
}: {
  name: string;
  options: readonly string[];
  selected?: string[];
}) {
  return (
    <div className="check-options">
      {options.map((option) => (
        <label key={option}>
          <input
            type="checkbox"
            name={name}
            value={option}
            defaultChecked={selected.includes(option)}
          />
          {humanize(option)}
        </label>
      ))}
    </div>
  );
}

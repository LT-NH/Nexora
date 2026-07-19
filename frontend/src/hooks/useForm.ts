import { useState, useCallback } from 'react';

type ErrorsMap = Record<string, string>;

interface UseFormErrorsReturn {
  errors: ErrorsMap;
  setFieldError: (field: string, message: string) => void;
  clearFieldError: (field: string) => void;
  setErrors: (errors: ErrorsMap) => void;
  clearErrors: () => void;
  hasErrors: () => boolean;
}

/**
 * Hook for managing field-level form validation errors.
 * Usage:
 *   const { errors, setFieldError, clearErrors, setErrors } = useFormErrors();
 *   // In submit handler:
 *   if (!formName.trim()) { setFieldError('name', '姓名不能为空'); return; }
 *   // In JSX:
 *   <Input label="姓名" error={errors.name} ... />
 */
export function useFormErrors(): UseFormErrorsReturn {
  const [errors, setErrorsState] = useState<ErrorsMap>({});

  const setFieldError = useCallback((field: string, message: string) => {
    setErrorsState((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setErrorsState((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearErrors = useCallback(() => {
    setErrorsState({});
  }, []);

  const setErrors = useCallback((newErrors: ErrorsMap) => {
    setErrorsState(newErrors);
  }, []);

  const hasErrors = useCallback(() => {
    return Object.keys(errors).length > 0;
  }, [errors]);

  return { errors, setFieldError, clearFieldError, setErrors, clearErrors, hasErrors };
}

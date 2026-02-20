import { useState, useMemo } from 'react';

function validateField(val, fieldRules, form) {
  for (const rule of fieldRules) {
    if (rule.required) {
      const empty = val === null || val === undefined || (typeof val === 'string' && !val.trim()) || val === '';
      if (empty) return rule.message;
    }
    if (rule.minLength != null && typeof val === 'string' && val.length < rule.minLength) {
      return rule.message;
    }
    if (rule.maxLength != null && typeof val === 'string' && val.length > rule.maxLength) {
      return rule.message;
    }
    if (rule.min != null && val !== '' && val !== null && val !== undefined && Number(val) < rule.min) {
      return rule.message;
    }
    if (rule.max != null && val !== '' && val !== null && val !== undefined && Number(val) > rule.max) {
      return rule.message;
    }
    if (rule.pattern && typeof val === 'string' && val && !rule.pattern.test(val)) {
      return rule.message;
    }
    if (rule.custom && val !== '' && val !== null && val !== undefined && !rule.custom(val, form)) {
      return rule.message;
    }
  }
  return null;
}

export default function useFormValidation(form, rules) {
  const [touched, setTouched] = useState({});

  const errors = useMemo(() => {
    const result = {};
    for (const [field, fieldRules] of Object.entries(rules)) {
      const err = validateField(form[field], fieldRules, form);
      if (err) result[field] = err;
    }
    return result;
  }, [form, rules]);

  const isValid = Object.keys(errors).length === 0;

  const touch = (field) => setTouched((prev) => ({ ...prev, [field]: true }));

  const touchAll = () => {
    const all = {};
    for (const field of Object.keys(rules)) all[field] = true;
    setTouched(all);
  };

  const resetTouched = () => setTouched({});

  return { errors, touched, touch, touchAll, resetTouched, isValid };
}

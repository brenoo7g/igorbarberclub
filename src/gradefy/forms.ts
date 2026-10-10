export type AccountFields = 'name' | 'email' | 'password' | 'confirmPassword';
export type FormErrors = Partial<Record<AccountFields, string>>;
export interface AccountValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function validateEmail(value: string) {
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) || value.trim().length > 200
    ? 'Informe um e-mail válido.'
    : undefined;
}
export function validatePassword(value: string, minimum = 1) {
  if (!value || value.length < minimum)
    return minimum > 1 ? `Use pelo menos ${minimum} caracteres.` : 'Informe sua senha.';
  if (new TextEncoder().encode(value).length > 72) return 'Use uma senha de até 72 bytes.';
}

export function validateAccount(values: AccountValues, register = false): FormErrors {
  const errors: FormErrors = {};
  if (register && (values.name.trim().length < 2 || values.name.trim().length > 100))
    errors.name = 'Informe seu nome, com 2 a 100 caracteres.';
  const emailError = validateEmail(values.email);
  const passwordError = validatePassword(values.password, register ? 8 : 1);
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  if (register && values.password !== values.confirmPassword)
    errors.confirmPassword = 'As senhas não coincidem.';
  return errors;
}

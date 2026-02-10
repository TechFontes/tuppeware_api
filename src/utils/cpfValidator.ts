/**
 * Valida um CPF brasileiro.
 * @param cpf - CPF a ser validado (com ou sem formatação)
 * @returns true se o CPF for válido
 */
const isValidCPF = (cpf: string): boolean => {
  // Remove caracteres não numéricos
  const cleaned = cpf.replace(/\D/g, '');

  // Verifica se tem 11 dígitos
  if (cleaned.length !== 11) {
    return false;
  }

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cleaned)) {
    return false;
  }

  // Validação do primeiro dígito verificador
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i)) * (10 - i);
  }

  let remainder = (sum * 10) % 11;

  if (remainder === 10) {
    remainder = 0;
  }

  if (remainder !== parseInt(cleaned.charAt(9))) {
    return false;
  }

  // Validação do segundo dígito verificador
  sum = 0;

  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned.charAt(i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;

  if (remainder === 10) {
    remainder = 0;
  }

  if (remainder !== parseInt(cleaned.charAt(10))) {
    return false;
  }

  return true;
};

/**
 * Remove formatação do CPF e retorna apenas números.
 * @param cpf - CPF com ou sem formatação
 * @returns CPF apenas com números
 */
const cleanCPF = (cpf: string): string => {
  return cpf.replace(/\D/g, '');
};

/**
 * Formata um CPF no padrão XXX.XXX.XXX-XX.
 * @param cpf - CPF apenas com números
 * @returns CPF formatado
 */
const formatCPF = (cpf: string): string => {
  const cleaned = cpf.replace(/\D/g, '');

  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

export { isValidCPF, cleanCPF, formatCPF };

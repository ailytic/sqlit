export const pluraliser = {
  style: 'javascript',
  forms: {
    child: 'children'
  }
};

export function pluralise(name: string): string {
  const forms = pluraliser.forms;

  if (name in forms) {
    return forms[name];
  }

  if (pluraliser.style === 'java') {
    return name + 'List';
  }

  for (const key in forms) {
    if (name.endsWith(key)) {
      return name.substr(0, name.length - key.length) + forms[key];
    }
    if (name.endsWith(_U(key))) {
      return name.substr(0, name.length - key.length) + _U(forms[key]);
    }
  }

  let result;

  if ((result = name.replace(/([^aeiou])y$/i, '$1ies')) != name) {
    return result;
  }

  if ((result = name.replace(/ty$/, 'ties')) != name) {
    return result;
  }

  if ((result = name.replace(/s$/, 'ses')) != name) {
    return result;
  }

  return name + 's';
}

function _U(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function setPluralForms(data: { [key: string]: string }): void {
  for (const key in data) {
    pluraliser.forms[key] = data[key];
  }
}

export function setPluralForm(singular: string, plural: string): void {
  pluraliser.forms[singular] = plural;
}

export function toCamelCase(s: string): string {
  return s.replace(/_\w/g, m => m[1].toUpperCase());
}

export function toPascalCase(s: string): string {
  s = toCamelCase(s);
  return s[0].toUpperCase() + s.substr(1);
}

export function toArray(args): Array<any> {
  return Array.isArray(args) ? args : [args];
}

const reflect = p => p.then(value => ({ value }), error => ({ error }));

export function promiseAll(promises: Promise<any>[]) {
  return Promise.all(promises.map(reflect)).then(results => {
    const error = results.find(result => 'error' in result);
    if (error) {
      throw error.error;
    } else {
      return results.map(result => result.value);
    }
  });
}

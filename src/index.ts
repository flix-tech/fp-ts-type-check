import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/pipeable';

/**
 * Helper functions to compose "type guard"-like functions with strict type checks.
 */

export interface ParseError {
  path: string;
  message: string;
}

const parseError = (message: string): ParseError => ({ path: '', message });
const addKeyPrefix = (part: string) => (err: ParseError): ParseError => ({
  path: `.${part}${err.path}`,
  message: err.message,
});
const addIndexPrefix = (index: string|number) => (err: ParseError): ParseError => ({
  path: `[${index}]${err.path}`,
  message: err.message,
});

export type ParseResult<A> = E.Either<ParseError, A>;
export type Parser<OUT, IN = unknown> = {
  (x: IN): ParseResult<OUT & IN>;
  right?: (x: OUT) => void; // A fake function to disallow assigning of Parser<A> to Parser<A|B>. Should be undefined.
};

const traverseParsers = <A>(
  xs: unknown[],
  parser: Parser<A>
): ParseResult<A[]> => {
  const results: A[] = [];
  for (let index in xs) {
    const result = parser(xs[index]);
    if (E.isLeft(result)) {
      return E.mapLeft(addIndexPrefix(index))(result);
    }

    results.push(result.right);
  }

  return E.right(results);
}

type TypeName<T> = T extends string
  ? 'string'
  : T extends number
  ? 'number'
  : T extends boolean
  ? 'boolean'
  : T extends undefined
  ? 'undefined'
  : T extends (...p: any[]) => any
  ? 'function'
  : T extends object
  ? 'object'
  : 'unknown';

const typeGuard = <A>(typeName: TypeName<A>, x: unknown): x is A =>
  typeof x === typeName;
const typeParser = <A, IN = unknown>(
  typeName: TypeName<A>
): Parser<A & IN, IN> => (x: IN) =>
  typeGuard<A>(typeName, x)
    ? E.right(x)
    : E.left(parseError('expected ' + typeName + ', got ' + typeof x));

export const string = typeParser<string>('string');
export const boolean = typeParser<boolean>('boolean');
export const number = typeParser<number>('number');
export const object = (x: unknown) =>
  x === null
  ? E.left(parseError('expected object, got null'))
  : typeGuard<Record<string, unknown>>('object', x)
  ? E.right(x)
  : E.left(parseError('expected object, got ' + typeof x));

export const any: Parser<any> = E.right

// Validates that x matches exactly one value
export const exact = <A>(expected: A): Parser<A> => x =>
  expected === x
    ? E.right(expected)
    : E.left(parseError(`expected '${expected}', got '${x}'`));

export const and = <OUT, MIDDLE, IN = undefined>(
  parserA: Parser<MIDDLE, IN>,
  parserB: Parser<OUT, MIDDLE & IN>
): Parser<MIDDLE & OUT, IN> => x => pipe(parserA(x), E.chain(parserB));

export const or = <A, B, IN = undefined>(
  parserA: Parser<A, IN>,
  parserB: Parser<B, IN>
): Parser<A | B, IN> => x => {
  const a: ParseResult<(A | B) & IN> = parserA(x);
  return E.isRight(a) ? a : parserB(x);
};

// Validates that x is one of whitelisted values
export const oneOf = <A>(allowed: A[]): Parser<A> => x =>
  pipe(
    allowed.find(a => a === x),
    O.fromNullable,
    E.fromOption(() => parseError(`value ${x} is not in whitelist`))
  );

const isKeyOf = <A extends Record<string, unknown>>(
  a: A,
  x: string | number | symbol
): x is keyof A => a.hasOwnProperty(x);
export const keyOf = <A extends Record<string, unknown>>(
  allowed: A
): Parser<keyof A> => x =>
  pipe(
    string(x),
    E.chain(xStr =>
      isKeyOf(allowed, xStr)
        ? E.right(xStr)
        : E.left(parseError(`value ${xStr} is not in whitelist`))
    )
  );

// Validates that x is an object with valid fields
export const type = <A, IN = unknown>(
  propertyParsers: { [K in keyof A]: Parser<A[K]> }
): Parser<A & IN, IN> => (x: IN) =>
  pipe(
    typeParser<Record<string, unknown>, IN>('object')(x),
    E.chain((obj: IN & Record<string, unknown>) => {
      const result = {} as A;
      for (const key in propertyParsers) {
        if (propertyParsers.hasOwnProperty(key)) {
          const parser = propertyParsers[key];
          const property = isKeyOf(obj, key) ? obj[key] : undefined;
          const parsedProperty = parser(property);
          if (E.isLeft(parsedProperty)) {
            return E.mapLeft(addKeyPrefix(key.toString()))(parsedProperty);
          }
          result[key] = parsedProperty.right;
        }
      }
      return E.right({ ...obj, ...result } as A & IN);
    })
  );

// Validator for optional values
export const optional = <A>(parseBody: Parser<A>): Parser<A | undefined> => x =>
  x === undefined ? E.right(undefined) : parseBody(x);

export const nullable = <A>(parseBody: Parser<A>): Parser<A | null> => x =>
  x === null ? E.right(null) : parseBody(x);

// Validates that x is array of type A
export const arrayOf = <A>(parseBody: Parser<A>): Parser<A[]> => x =>
  Array.isArray(x)
    ? traverseParsers(x, parseBody)
    : E.left(parseError('expected array, got' + typeof x));

interface HasTypeField {
  type: string;
}
type DiscriminatedUnionParsers<T extends HasTypeField> = {
  [K in T['type']]: T extends { type: K }
    ? Parser<T, { type: T['type'] }>
    : never;
};
// We expect an object with "type" property and we have a parser for each possible type
export const discriminatedUnion = <A extends HasTypeField>(
  parsers: DiscriminatedUnionParsers<A>
): Parser<A> => x =>
  pipe(
    type({ type: keyOf(parsers) })(x),
    E.chain(xObj => {
      const parser: Parser<A, { type: A['type'] }> = parsers[xObj.type];
      return parser(xObj);
    })
  );

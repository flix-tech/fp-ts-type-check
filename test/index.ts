import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/pipeable';

import * as P from '../src/index';
import { Parser } from '../src/index';

const values = {
  string: 'foo',
  number: 42,
  boolean: true,
  object: { foo: 42 },
  undefined: undefined,
};

const isChecksSampleValues = <A>(
  parser: P.Parser<A>,
  sampleValues: Record<string, unknown>,
  expectedResult: (key: string) => boolean
): void => {
  for (const [key, value] of Object.entries(sampleValues)) {
    const shouldPass = expectedResult(key);
    it(`${shouldPass ? 'passes' : 'fails'} when the input is ${key}`, () => {
      const result = parser(value);

      const error = pipe(result, E.swap, O.fromEither);

      if (shouldPass) {
        expect(error).toEqual(O.none);
      } else {
        expect(error).not.toEqual(O.none);
      }
    });
  }
};

describe('Type guards', () => {
  describe('string parser', () => {
    isChecksSampleValues(P.string, values, (key) => key === 'string');
  });
  describe('number parser', () => {
    isChecksSampleValues(P.number, values, (key) => key === 'number');
  });
  describe('boolean parser', () => {
    isChecksSampleValues(P.boolean, values, (key) => key === 'boolean');
  });
  describe('object parser', () => {
    isChecksSampleValues(P.object, values, (key) => key === 'object');
  });
});

describe('Nullable string parser', () => {
  isChecksSampleValues(P.nullable(P.string), values, (key) => ['string', 'undefined'].includes(key));
});

describe('String array parser', () => {
  const sampleArrays = {
    valid: ['foo', 'bar'],
    empty: [],
    'a string': 'foo',
    'an array with numbers': [42, 43],
    'an array with mixed types': ['foo', 42],
  };
  const parser = P.array<string>(P.string);
  isChecksSampleValues(parser, sampleArrays, (key) => ['valid', 'empty'].includes(key));
});

describe('Type parser', () => {
  type Foo = {
    foo: string;
    bar: number;
  };
  const sampleFoos = {
    valid: { foo: 'hello', bar: 42 },
    'a string': 'foo',
    'an object without required fields': { foo: 'hello' },
    'an object with wrong value type': { foo: 'hello', bar: 'world' },
  };
  const parser = P.type<Foo>({
    foo: P.string,
    bar: P.number,
  });
  isChecksSampleValues(parser, sampleFoos, (key) => key === 'valid');
});

describe('And parser', () => {
  type Foo = {
    foo: string;
    bar: number;
  };

  const sampleFoos = {
    valid: { foo: 'hello', bar: 42 },
    'a string': 'foo',
    'an object without first part': { bar: 42 },
    'an object without second part': { foo: 'hello' },
    'an object with wrong value type': { foo: 'hello', bar: 'world' },
  };

  const parser: P.Parser<Foo> = P.and(P.type({ foo: P.string }), P.type({ bar: P.number }));
  isChecksSampleValues(parser, sampleFoos, (key) => key === 'valid');
});

describe('Or parser', () => {
  const parser: Parser<string | number> = P.or(P.string, P.number);
  isChecksSampleValues(parser, values, (key) => ['string', 'number'].includes(key));
});

describe('DiscriminatedUnion parser', () => {
  type FooBar = { type: 'foo'; foo: number } | { type: 'bar'; bar: number };

  const sampleFooBars = {
    'valid foo': { type: 'foo', foo: 42 },
    'valid bar': { type: 'bar', bar: 42 },
    'a string': 'foo',
    'a foo without type': { foo: 42 },
    'a wrongly typed foo': { type: 'bar', foo: 42 },
    'a foo without parameters': { type: 'foo' },
  };

  const parser: P.Parser<FooBar> = P.discriminatedUnion({
    foo: P.type({ foo: P.number }),
    bar: P.type({ bar: P.number }),
  });
  isChecksSampleValues(parser, sampleFooBars, (key) => ['valid foo', 'valid bar'].includes(key));
});

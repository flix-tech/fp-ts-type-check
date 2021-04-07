fp-ts-type-check is a library for runtime type validation of variables where you can't say their type for sure i.e. data you get via some API. It's somewhat similar to Typescript's [Type Guards](https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards) except it uses type system to make sure this data is properly validated.

Features:

* **Type safe.** Typescript compiler makes sure your types and your type checkers are always in sync.
* **Detailed error reports.** If parsing of a big deep-nested structure failed - you'll know where exactly in that structure you have invalid data and why it was considered invalid
* **Composable.** Type checkers for big structures are created by composing checkers for simple structures. 
* **Functional.** Each type checker is a pure function returning `Either` type from fp-ts. It's up for you to decide how to handle errors.
* **[Tree-shakeable](https://webpack.js.org/guides/tree-shaking/).** Bundle only functions you really use.

## Installation

To install the stable version:

```
npm install '@flix-tech/fp-ts-type-check@~0.2.0'
```

While the major version number is 0 changes in minor version number bay break backward compatibility so you should stick to a fixed minor version.

## Usage

Meet `Parser[T]`, the main type of this library. `Parser[T]` is a function that takes any variable and checks if it's a variable of type `T`. It either returns the same value as `T` or `ParseError` object with parse error details. Parser's type definition looks somewhat like this:

```typescript
type Parser<A> = (x: unknown): Either<ParseError, A>;

interface ParseError {
  path: string; // Path to the property causing error in deep nested structures
  message: string; // Parsing error message
}
```

We're using the type [Either](https://gcanti.github.io/fp-ts/modules/Either.ts.html) from [fp-ts](https://github.com/gcanti/fp-ts) library.

Parsers for some complex structures you'd want to validate are composed from small parsers like here:

```typescript
import * as P from 'fp-ts-type-check';

interface ShoppingListItem {
  name: string;
  amount: { count: number; unit?: string };
}
const shoppingListItemParser: P.Parser<ShoppingListItem> = P.type({
  name: P.string,
  amount: P.type({
    count: P.number,
    unit: P.optional(P.string),
  }),
});

shoppingListItem({name: "Apple", amount: {count: 5}}); // Right<ShoppingListItem>({name: "Apple", amount: {count: 5}})

shoppingListItem({name: "Apple", amount: {count: "some"}}); // Left<ParseError>({path: ".amount.count", message: "expected number, got string"})
```

As you can see, `ParseError` data is for your eyes only, user should get a generalized error message appropriate in this case.

You can reuse your parsers to construct parsers for even bigger structures:

```typescript
type ShoppingList = array<ShoppingListItem>;

const shoppingListParser: P.Parser<ShoppingList> = P.arrayOf(shoppingListItemParser);

const validShoppingList = [
  {name: "Apple", amount: {count: 5}},
  {name: "Milk", amount: {count: 500, unit: 'ml'}},
];
shoppingListParser(validShoppingList); // Right<ShoppingList>(...)

const invalidShoppingList = [
  {name: "Apple", amount: {count: 5}},
  {name: "Milk", amount: {unit: 'ml'}}, // No count here
];
shoppingListParser(invalidShoppingList); // Left<ParseError>({path: "[1].amount.count", message: "expected number, got undefined"})
```

# API documentation

### Simple type parsers

* `string(): Parser<string>` - checks that value is string.
* `boolean(): Parser<boolean>` - checks that value is boolean.
* `number(): Parser<number>` - checks that value is number.
* `object(): Parser<object>` - checks that value is any object.
* `any(): Parser<any>` - does not check anything.
* `exact<A>(expected: A): Parser<A>` - checks that value is same as expected one.
* `oneOf<A>(allowed: A[]): Parser<A>` - checks that value is one of allowed ones.
* `keyOf<A extends object>(allowed: A): Parser<keyof A>` - checks that value is string and also is a key of object `allowed`.

## Copositional parsers

* `type<A>(propertyParsers: { [K in keyof A]: Parser<A[K]> }): Parser<A>` - checks that values is an object and validates each it's property with corresponding parser.

* `arrayOf<A>(parseBody: Parser<A>): Parser<A[]>` - checks that value is an array and every item matches  `parseBody` parser.

* `optional<A>(parseBody: Parser<A>): Parser<A | undefined>` - checks that value is either undefined or matches `parseBody` parser.

* `nullable<A>(parseBody: Parser<A>): Parser<A | null>` - checks that value is either null or matches `parseBody` parser.

* `discriminatedUnion<A extends {type: string;}>(parsers: {(type value): (type parser)}): Parser<A>` - checks that value is a [discriminated union](https://www.typescriptlang.org/docs/handbook/advanced-types.html#discriminated-unions) with discriminant in `type` property. Example usage:

  ```typescript
  type Foo = { type: 'foo'; foo: number };
  type Bar = { type: 'bar'; bar: number };
  type FooBar = Foo | Bar;
  
  const parser: P.Parser<FooBar> = P.discriminatedUnion({
    foo: P.type({ foo: P.number }),
    bar: P.type({ bar: P.number }),
  });
  ```

### Logic combination parsers

* `and(parserA: Parser<A>, parserB<B>): Parser<A & B>` - checks that value matches both types A and B.
* `or(parserA: Parser<A>, parserB<B>): Parser<A | B>` - checks that value matches any of types A or B.

## License

The MIT License (MIT)

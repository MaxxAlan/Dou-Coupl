# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetMyMessages*](#getmymessages)
  - [*GetUpcomingReminders*](#getupcomingreminders)
- [**Mutations**](#mutations)
  - [*CreateCouple*](#createcouple)
  - [*SendMessage*](#sendmessage)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetMyMessages
You can execute the `GetMyMessages` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getMyMessages(vars: GetMyMessagesVariables, options?: ExecuteQueryOptions): QueryPromise<GetMyMessagesData, GetMyMessagesVariables>;

interface GetMyMessagesRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetMyMessagesVariables): QueryRef<GetMyMessagesData, GetMyMessagesVariables>;
}
export const getMyMessagesRef: GetMyMessagesRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getMyMessages(dc: DataConnect, vars: GetMyMessagesVariables, options?: ExecuteQueryOptions): QueryPromise<GetMyMessagesData, GetMyMessagesVariables>;

interface GetMyMessagesRef {
  ...
  (dc: DataConnect, vars: GetMyMessagesVariables): QueryRef<GetMyMessagesData, GetMyMessagesVariables>;
}
export const getMyMessagesRef: GetMyMessagesRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getMyMessagesRef:
```typescript
const name = getMyMessagesRef.operationName;
console.log(name);
```

### Variables
The `GetMyMessages` query requires an argument of type `GetMyMessagesVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetMyMessagesVariables {
  coupleId: UUIDString;
}
```
### Return Type
Recall that executing the `GetMyMessages` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetMyMessagesData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetMyMessagesData {
  messages: ({
    text: string;
    createdAt: TimestampString;
    sender: {
      displayName: string;
    };
  })[];
}
```
### Using `GetMyMessages`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getMyMessages, GetMyMessagesVariables } from '@dataconnect/generated';

// The `GetMyMessages` query requires an argument of type `GetMyMessagesVariables`:
const getMyMessagesVars: GetMyMessagesVariables = {
  coupleId: ..., 
};

// Call the `getMyMessages()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getMyMessages(getMyMessagesVars);
// Variables can be defined inline as well.
const { data } = await getMyMessages({ coupleId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getMyMessages(dataConnect, getMyMessagesVars);

console.log(data.messages);

// Or, you can use the `Promise` API.
getMyMessages(getMyMessagesVars).then((response) => {
  const data = response.data;
  console.log(data.messages);
});
```

### Using `GetMyMessages`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getMyMessagesRef, GetMyMessagesVariables } from '@dataconnect/generated';

// The `GetMyMessages` query requires an argument of type `GetMyMessagesVariables`:
const getMyMessagesVars: GetMyMessagesVariables = {
  coupleId: ..., 
};

// Call the `getMyMessagesRef()` function to get a reference to the query.
const ref = getMyMessagesRef(getMyMessagesVars);
// Variables can be defined inline as well.
const ref = getMyMessagesRef({ coupleId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getMyMessagesRef(dataConnect, getMyMessagesVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.messages);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.messages);
});
```

## GetUpcomingReminders
You can execute the `GetUpcomingReminders` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getUpcomingReminders(vars: GetUpcomingRemindersVariables, options?: ExecuteQueryOptions): QueryPromise<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;

interface GetUpcomingRemindersRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUpcomingRemindersVariables): QueryRef<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;
}
export const getUpcomingRemindersRef: GetUpcomingRemindersRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getUpcomingReminders(dc: DataConnect, vars: GetUpcomingRemindersVariables, options?: ExecuteQueryOptions): QueryPromise<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;

interface GetUpcomingRemindersRef {
  ...
  (dc: DataConnect, vars: GetUpcomingRemindersVariables): QueryRef<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;
}
export const getUpcomingRemindersRef: GetUpcomingRemindersRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getUpcomingRemindersRef:
```typescript
const name = getUpcomingRemindersRef.operationName;
console.log(name);
```

### Variables
The `GetUpcomingReminders` query requires an argument of type `GetUpcomingRemindersVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetUpcomingRemindersVariables {
  coupleId: UUIDString;
}
```
### Return Type
Recall that executing the `GetUpcomingReminders` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetUpcomingRemindersData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetUpcomingRemindersData {
  reminders: ({
    title: string;
    eventDate: DateString;
    isRecurring: boolean;
  })[];
}
```
### Using `GetUpcomingReminders`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getUpcomingReminders, GetUpcomingRemindersVariables } from '@dataconnect/generated';

// The `GetUpcomingReminders` query requires an argument of type `GetUpcomingRemindersVariables`:
const getUpcomingRemindersVars: GetUpcomingRemindersVariables = {
  coupleId: ..., 
};

// Call the `getUpcomingReminders()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getUpcomingReminders(getUpcomingRemindersVars);
// Variables can be defined inline as well.
const { data } = await getUpcomingReminders({ coupleId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getUpcomingReminders(dataConnect, getUpcomingRemindersVars);

console.log(data.reminders);

// Or, you can use the `Promise` API.
getUpcomingReminders(getUpcomingRemindersVars).then((response) => {
  const data = response.data;
  console.log(data.reminders);
});
```

### Using `GetUpcomingReminders`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getUpcomingRemindersRef, GetUpcomingRemindersVariables } from '@dataconnect/generated';

// The `GetUpcomingReminders` query requires an argument of type `GetUpcomingRemindersVariables`:
const getUpcomingRemindersVars: GetUpcomingRemindersVariables = {
  coupleId: ..., 
};

// Call the `getUpcomingRemindersRef()` function to get a reference to the query.
const ref = getUpcomingRemindersRef(getUpcomingRemindersVars);
// Variables can be defined inline as well.
const ref = getUpcomingRemindersRef({ coupleId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getUpcomingRemindersRef(dataConnect, getUpcomingRemindersVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.reminders);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.reminders);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateCouple
You can execute the `CreateCouple` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createCouple(vars: CreateCoupleVariables): MutationPromise<CreateCoupleData, CreateCoupleVariables>;

interface CreateCoupleRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateCoupleVariables): MutationRef<CreateCoupleData, CreateCoupleVariables>;
}
export const createCoupleRef: CreateCoupleRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createCouple(dc: DataConnect, vars: CreateCoupleVariables): MutationPromise<CreateCoupleData, CreateCoupleVariables>;

interface CreateCoupleRef {
  ...
  (dc: DataConnect, vars: CreateCoupleVariables): MutationRef<CreateCoupleData, CreateCoupleVariables>;
}
export const createCoupleRef: CreateCoupleRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createCoupleRef:
```typescript
const name = createCoupleRef.operationName;
console.log(name);
```

### Variables
The `CreateCouple` mutation requires an argument of type `CreateCoupleVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateCoupleVariables {
  partner1Id: UUIDString;
  partner2Id: UUIDString;
  theme?: string | null;
}
```
### Return Type
Recall that executing the `CreateCouple` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateCoupleData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateCoupleData {
  couple_insert: Couple_Key;
}
```
### Using `CreateCouple`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createCouple, CreateCoupleVariables } from '@dataconnect/generated';

// The `CreateCouple` mutation requires an argument of type `CreateCoupleVariables`:
const createCoupleVars: CreateCoupleVariables = {
  partner1Id: ..., 
  partner2Id: ..., 
  theme: ..., // optional
};

// Call the `createCouple()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createCouple(createCoupleVars);
// Variables can be defined inline as well.
const { data } = await createCouple({ partner1Id: ..., partner2Id: ..., theme: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createCouple(dataConnect, createCoupleVars);

console.log(data.couple_insert);

// Or, you can use the `Promise` API.
createCouple(createCoupleVars).then((response) => {
  const data = response.data;
  console.log(data.couple_insert);
});
```

### Using `CreateCouple`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createCoupleRef, CreateCoupleVariables } from '@dataconnect/generated';

// The `CreateCouple` mutation requires an argument of type `CreateCoupleVariables`:
const createCoupleVars: CreateCoupleVariables = {
  partner1Id: ..., 
  partner2Id: ..., 
  theme: ..., // optional
};

// Call the `createCoupleRef()` function to get a reference to the mutation.
const ref = createCoupleRef(createCoupleVars);
// Variables can be defined inline as well.
const ref = createCoupleRef({ partner1Id: ..., partner2Id: ..., theme: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createCoupleRef(dataConnect, createCoupleVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.couple_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.couple_insert);
});
```

## SendMessage
You can execute the `SendMessage` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
sendMessage(vars: SendMessageVariables): MutationPromise<SendMessageData, SendMessageVariables>;

interface SendMessageRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: SendMessageVariables): MutationRef<SendMessageData, SendMessageVariables>;
}
export const sendMessageRef: SendMessageRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
sendMessage(dc: DataConnect, vars: SendMessageVariables): MutationPromise<SendMessageData, SendMessageVariables>;

interface SendMessageRef {
  ...
  (dc: DataConnect, vars: SendMessageVariables): MutationRef<SendMessageData, SendMessageVariables>;
}
export const sendMessageRef: SendMessageRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the sendMessageRef:
```typescript
const name = sendMessageRef.operationName;
console.log(name);
```

### Variables
The `SendMessage` mutation requires an argument of type `SendMessageVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface SendMessageVariables {
  coupleId: UUIDString;
  text: string;
}
```
### Return Type
Recall that executing the `SendMessage` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `SendMessageData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface SendMessageData {
  message_insert: Message_Key;
}
```
### Using `SendMessage`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, sendMessage, SendMessageVariables } from '@dataconnect/generated';

// The `SendMessage` mutation requires an argument of type `SendMessageVariables`:
const sendMessageVars: SendMessageVariables = {
  coupleId: ..., 
  text: ..., 
};

// Call the `sendMessage()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await sendMessage(sendMessageVars);
// Variables can be defined inline as well.
const { data } = await sendMessage({ coupleId: ..., text: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await sendMessage(dataConnect, sendMessageVars);

console.log(data.message_insert);

// Or, you can use the `Promise` API.
sendMessage(sendMessageVars).then((response) => {
  const data = response.data;
  console.log(data.message_insert);
});
```

### Using `SendMessage`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, sendMessageRef, SendMessageVariables } from '@dataconnect/generated';

// The `SendMessage` mutation requires an argument of type `SendMessageVariables`:
const sendMessageVars: SendMessageVariables = {
  coupleId: ..., 
  text: ..., 
};

// Call the `sendMessageRef()` function to get a reference to the mutation.
const ref = sendMessageRef(sendMessageVars);
// Variables can be defined inline as well.
const ref = sendMessageRef({ coupleId: ..., text: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = sendMessageRef(dataConnect, sendMessageVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.message_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.message_insert);
});
```


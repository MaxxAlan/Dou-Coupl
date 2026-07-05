import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise, DataConnectSettings } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;
export const dataConnectSettings: DataConnectSettings;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface Couple_Key {
  id: UUIDString;
  __typename?: 'Couple_Key';
}

export interface CreateCoupleData {
  couple_insert: Couple_Key;
}

export interface CreateCoupleVariables {
  partner1Id: UUIDString;
  partner2Id: UUIDString;
  theme?: string | null;
}

export interface GetMyMessagesData {
  messages: ({
    text: string;
    createdAt: TimestampString;
    sender: {
      displayName: string;
    };
  })[];
}

export interface GetMyMessagesVariables {
  coupleId: UUIDString;
}

export interface GetUpcomingRemindersData {
  reminders: ({
    title: string;
    eventDate: DateString;
    isRecurring: boolean;
  })[];
}

export interface GetUpcomingRemindersVariables {
  coupleId: UUIDString;
}

export interface Memory_Key {
  id: UUIDString;
  __typename?: 'Memory_Key';
}

export interface Message_Key {
  id: UUIDString;
  __typename?: 'Message_Key';
}

export interface Reminder_Key {
  id: UUIDString;
  __typename?: 'Reminder_Key';
}

export interface SendMessageData {
  message_insert: Message_Key;
}

export interface SendMessageVariables {
  coupleId: UUIDString;
  text: string;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface CreateCoupleRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateCoupleVariables): MutationRef<CreateCoupleData, CreateCoupleVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateCoupleVariables): MutationRef<CreateCoupleData, CreateCoupleVariables>;
  operationName: string;
}
export const createCoupleRef: CreateCoupleRef;

export function createCouple(vars: CreateCoupleVariables): MutationPromise<CreateCoupleData, CreateCoupleVariables>;
export function createCouple(dc: DataConnect, vars: CreateCoupleVariables): MutationPromise<CreateCoupleData, CreateCoupleVariables>;

interface SendMessageRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: SendMessageVariables): MutationRef<SendMessageData, SendMessageVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: SendMessageVariables): MutationRef<SendMessageData, SendMessageVariables>;
  operationName: string;
}
export const sendMessageRef: SendMessageRef;

export function sendMessage(vars: SendMessageVariables): MutationPromise<SendMessageData, SendMessageVariables>;
export function sendMessage(dc: DataConnect, vars: SendMessageVariables): MutationPromise<SendMessageData, SendMessageVariables>;

interface GetMyMessagesRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetMyMessagesVariables): QueryRef<GetMyMessagesData, GetMyMessagesVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetMyMessagesVariables): QueryRef<GetMyMessagesData, GetMyMessagesVariables>;
  operationName: string;
}
export const getMyMessagesRef: GetMyMessagesRef;

export function getMyMessages(vars: GetMyMessagesVariables, options?: ExecuteQueryOptions): QueryPromise<GetMyMessagesData, GetMyMessagesVariables>;
export function getMyMessages(dc: DataConnect, vars: GetMyMessagesVariables, options?: ExecuteQueryOptions): QueryPromise<GetMyMessagesData, GetMyMessagesVariables>;

interface GetUpcomingRemindersRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUpcomingRemindersVariables): QueryRef<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetUpcomingRemindersVariables): QueryRef<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;
  operationName: string;
}
export const getUpcomingRemindersRef: GetUpcomingRemindersRef;

export function getUpcomingReminders(vars: GetUpcomingRemindersVariables, options?: ExecuteQueryOptions): QueryPromise<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;
export function getUpcomingReminders(dc: DataConnect, vars: GetUpcomingRemindersVariables, options?: ExecuteQueryOptions): QueryPromise<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;


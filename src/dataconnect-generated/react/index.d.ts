import { CreateCoupleData, CreateCoupleVariables, SendMessageData, SendMessageVariables, GetMyMessagesData, GetMyMessagesVariables, GetUpcomingRemindersData, GetUpcomingRemindersVariables } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateCouple(options?: useDataConnectMutationOptions<CreateCoupleData, FirebaseError, CreateCoupleVariables>): UseDataConnectMutationResult<CreateCoupleData, CreateCoupleVariables>;
export function useCreateCouple(dc: DataConnect, options?: useDataConnectMutationOptions<CreateCoupleData, FirebaseError, CreateCoupleVariables>): UseDataConnectMutationResult<CreateCoupleData, CreateCoupleVariables>;

export function useSendMessage(options?: useDataConnectMutationOptions<SendMessageData, FirebaseError, SendMessageVariables>): UseDataConnectMutationResult<SendMessageData, SendMessageVariables>;
export function useSendMessage(dc: DataConnect, options?: useDataConnectMutationOptions<SendMessageData, FirebaseError, SendMessageVariables>): UseDataConnectMutationResult<SendMessageData, SendMessageVariables>;

export function useGetMyMessages(vars: GetMyMessagesVariables, options?: useDataConnectQueryOptions<GetMyMessagesData>): UseDataConnectQueryResult<GetMyMessagesData, GetMyMessagesVariables>;
export function useGetMyMessages(dc: DataConnect, vars: GetMyMessagesVariables, options?: useDataConnectQueryOptions<GetMyMessagesData>): UseDataConnectQueryResult<GetMyMessagesData, GetMyMessagesVariables>;

export function useGetUpcomingReminders(vars: GetUpcomingRemindersVariables, options?: useDataConnectQueryOptions<GetUpcomingRemindersData>): UseDataConnectQueryResult<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;
export function useGetUpcomingReminders(dc: DataConnect, vars: GetUpcomingRemindersVariables, options?: useDataConnectQueryOptions<GetUpcomingRemindersData>): UseDataConnectQueryResult<GetUpcomingRemindersData, GetUpcomingRemindersVariables>;

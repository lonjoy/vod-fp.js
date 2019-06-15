import * as oop from './oop';
import {
  F,
  Maybe,
  Just,
  Empty,
  Fail,
  Success,
  either,
  maybe,
  maybeToEither,
  Task,
  Tick
} from './fp';

const {
  EventBus,
  PipeLine,
  StateMachine,
  combineActions,
  combineStates,
  createStore
} = oop;

export {
  F,
  Maybe,
  Just,
  Empty,
  Fail,
  Success,
  either,
  maybe,
  maybeToEither,
  Task,
  EventBus,
  PipeLine,
  StateMachine,
  Tick,
  combineActions,
  combineStates,
  createStore
};

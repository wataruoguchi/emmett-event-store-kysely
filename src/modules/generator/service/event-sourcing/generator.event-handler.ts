// biome-ignore assist/source/organizeImports: The editor doesn't work for this import
import {
  DeciderCommandHandler,
  EmmettError,
  IllegalStateError,
  type Command,
  type Event,
} from "@event-driven-io/emmett";
import type { EventStore } from "../../../shared/event-sourcing/event-store.js";
import type { AppContext } from "../../../shared/hono/context-middleware.js";
import type { GeneratorEntity } from "../../domain/generator.entity.js";

/**
 * Reference:
 * - https://event-driven.io/en/how_to_get_the_current_entity_state_in_event_sourcing/
 */

/**
 * ================================================
 * Decider
 * ================================================
 */
/**
 * 1. Read past events for a given stream (aggregate).
 * 2. Use `evolve` to fold all events and derive the current state.
 * 3. Pass the state and the new command to `decide`.
 * 4. `decide` returns new event(s).
 * 5. Persist those new events.
 *
 * decide: A function that groups our command handling into a single method. It receives the current state and a command, validates them and returns new event(s).
 * evolve: Reducer. A function that is used to build the current state from events.
 * initialState: The initial state of the domain object.
 */
export function generatorEventHandler({
  eventStore,
  getContext,
}: {
  eventStore: EventStore;
  getContext: () => AppContext;
}) {
  const handler = DeciderCommandHandler({
    decide: createDecide(getContext),
    evolve: createEvolve(),
    initialState,
  });
  return {
    create: (generatorId: string, data: GeneratorEntity) =>
      handler(
        eventStore,
        generatorId,
        // The following object is a domain command.
        {
          type: "CreateGenerator",
          data,
        },
        { partition: data.tenantId, streamType: "generator" },
      ),
    update: (generatorId: string, data: GeneratorEntity) =>
      handler(
        eventStore,
        generatorId,
        // The following object is a domain command.
        {
          type: "UpdateGenerator",
          data,
        },
        { partition: data.tenantId, streamType: "generator" },
      ),
    delete: (
      generatorId: string,
      data: { tenantId: string; generatorId: string },
    ) =>
      handler(
        eventStore,
        generatorId,
        // The following object is a domain command.
        {
          type: "DeleteGenerator",
          data,
        },
        { partition: data.tenantId, streamType: "generator" },
      ),
  };
}
export type GeneratorEventHandler = ReturnType<typeof generatorEventHandler>;

function createDecide(getContext: () => AppContext) {
  function buildMessageMetadataFromContext() {
    const { userId } = getContext();
    return { createdBy: userId };
  }
  function assertNotDeleted(
    state: DomainState,
  ): asserts state is CreatedGenerator | UpdatedGenerator {
    if (state.status === "deleted")
      throw new IllegalStateError("Generator has been deleted");
  }
  function assertInit(state: DomainState): asserts state is InitGenerator {
    if (state.status !== "init")
      throw new IllegalStateError("Generator is not initialized");
  }

  function assertCreatedOrUpdated(
    state: DomainState,
  ): asserts state is CreatedGenerator | UpdatedGenerator {
    if (state.status !== "created" && state.status !== "updated")
      throw new IllegalStateError("Generator is not created or updated");
  }
  /**
   * These functions are responsible for deciding the command's outcome using business rules.
   * Although we should aggregate business rules into a single function, we should't/can't use async here.
   */
  const handlers = {
    createGenerator: (command: CreateGenerator): GeneratorCreated => {
      const { data } = command;
      return {
        type: "GeneratorCreated",
        data,
        metadata: buildMessageMetadataFromContext(),
      };
    },
    updateGenerator: (
      command: UpdateGenerator,
      state: CreatedGenerator | UpdatedGenerator,
    ): GeneratorUpdated => {
      const { data } = command;
      const currentName = state.data.name;
      const { name: newName } = data;
      // ... There will be more business rules here.
      if (newName) {
        // TODO: Do we need to detect what properties are changed here?
        console.log(`Changing name from ${currentName} to ${newName}`);
      }
      return {
        type: "GeneratorUpdated",
        data,
        metadata: buildMessageMetadataFromContext(),
      };
    },
    deleteGenerator: (command: DeleteGenerator): GeneratorDeleted => {
      const {
        data: { generatorId },
      } = command;
      if (!generatorId) throw new IllegalStateError("ID Expected");
      return {
        type: "GeneratorDeleted",
        data: { generatorId },
        metadata: buildMessageMetadataFromContext(),
      };
    },
  };

  /**
   * Group all commands into a unified function that is easily extensible when you add more commands:
   * It returns a domain event.
   */
  return function decide(
    command: DomainCommand,
    state: DomainState,
  ): DomainEvent {
    const { type } = command;
    switch (type) {
      case "CreateGenerator":
        assertInit(state);
        // We do not pass state to the business logic because it doesn't care about the previous state.
        return handlers.createGenerator(command);
      case "UpdateGenerator":
        assertCreatedOrUpdated(state);
        assertNotDeleted(state);
        return handlers.updateGenerator(command, state);
      case "DeleteGenerator":
        assertNotDeleted(state);
        // We do not pass state to the business logic because it doesn't care about the previous state.
        return handlers.deleteGenerator(command);
      default: {
        // @ts-expect-error
        const _notExistingCommandType: never = type;
        throw new EmmettError("Unknown command type");
      }
    }
  };
}

function createEvolve() {
  /**
   * Calculate the next state based on the current state and the event.
   *
   * state: 0...Nth events folded.
   * event: N+1th event.
   */
  return function evolve(state: DomainState, event: DomainEvent): DomainState {
    const { type, data } = event;
    if (state.status === "deleted") return state;

    switch (type) {
      case "GeneratorCreated": {
        const nextState: DomainState = {
          status: "created",
          data, // "GeneratorCreated" must be the first event. So it does not need to care about the previous state.
        };
        return nextState;
      }
      case "GeneratorUpdated": {
        const nextState: DomainState = {
          status: "updated",
          data: { ...(state.data || {}), ...data },
        };
        return nextState;
      }
      case "GeneratorDeleted": {
        const { generatorId } = data;
        const nextState: DomainState = {
          status: "deleted",
          data: { generatorId },
        };
        return nextState;
      }
      default: {
        return state;
      }
    }
  };
}

export function initialState(): DomainState {
  return {
    status: "init",
    data: null,
  };
}

/**
 * ================================================
 * Domain Object
 *
 * The type declaration may have declared elsewhere with a layered architecture.
 * ================================================
 */
type GeneratorIdOnly = Pick<GeneratorEntity, "generatorId">;

/**
 * ================================================
 * Domain State
 *
 * - status: The status of the object being used by this state machine.
 * - data: The data we want to update the data with.
 * ================================================
 */
type InitGenerator = {
  status: "init";
  data: null;
};
type CreatedGenerator = {
  status: "created";
  data: GeneratorEntity;
};
type UpdatedGenerator = {
  status: "updated";
  data: GeneratorEntity;
};
type DeletedGenerator = {
  status: "deleted";
  data: GeneratorIdOnly;
};
type DomainState =
  | CreatedGenerator
  | UpdatedGenerator
  | DeletedGenerator
  | InitGenerator;

/**
 * ================================================
 * Domain Event
 *
 * Events record, what happened with what data. It is used in "evolve", and generated by "decide".
 * e.g.,
 * - Generator created with the given data.
 * - Generator updated with the given data.
 * - Generator deleted with the given id.
 * ================================================
 */
type EventMetadata = {
  createdBy: string;
};
type GeneratorCreated = Event<
  "GeneratorCreated",
  GeneratorEntity,
  EventMetadata
>;
type GeneratorUpdated = Event<
  "GeneratorUpdated",
  GeneratorEntity,
  EventMetadata
>;
type GeneratorDeleted = Event<
  "GeneratorDeleted",
  GeneratorIdOnly,
  EventMetadata
>;
type DomainEvent = GeneratorCreated | GeneratorUpdated | GeneratorDeleted;

/**
 * ================================================
 * Domain Command
 *
 * Commands are instructions to the application to perform a particular operation. Commands are used in "decide".
 * e.g.,
 * - Create a new generator with the given data.
 * - Update a generator with the given data.
 * - Delete a generator with the given id.
 * ================================================
 */
type CreateGenerator = Command<"CreateGenerator", GeneratorEntity>;
type UpdateGenerator = Command<"UpdateGenerator", GeneratorEntity>;
type DeleteGenerator = Command<
  "DeleteGenerator",
  GeneratorIdOnly & { tenantId: string }
>;
type DomainCommand = CreateGenerator | UpdateGenerator | DeleteGenerator;

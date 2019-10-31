// @flow

import {
  serializeError,
} from 'serialize-error';
import {
  parse as parseConnectionString,
} from 'pg-connection-string';
import {
  createUlid,
} from '../utilities';
import type {
  ClientUserConfigurationType,
  DatabasePoolType,
} from '../types';
import Logger from '../Logger';
import bindPool from '../binders/bindPool';
import createClientConfiguration from './createClientConfiguration';

/**
 * @param connectionUri PostgreSQL [Connection URI](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING).
 */
export default (
  connectionUri: string,
  clientUserConfiguration?: ClientUserConfigurationType,
): DatabasePoolType => {
  const clientConfiguration = createClientConfiguration(clientUserConfiguration);

  const poolId = createUlid();

  const poolLog = Logger.child({
    poolId,
  });

  const poolConfiguration = parseConnectionString(connectionUri);

  poolConfiguration.connectionTimeoutMillis = clientConfiguration.connectionTimeout;
  poolConfiguration.idleTimeoutMillis = clientConfiguration.idleTimeout;
  poolConfiguration.max = clientConfiguration.maximumPoolSize;
  poolConfiguration.min = clientConfiguration.minimumPoolSize;

  if (clientConfiguration.connectionTimeout === 'DISABLE_TIMEOUT') {
    poolConfiguration.connectionTimeout = 0;
  } else if (clientConfiguration.connectionTimeout === 0) {
    poolLog.warn('connectionTimeout=0 sets timeout to 0 milliseconds; use connectionTimeout=DISABLE_TIMEOUT to disable timeout');

    poolConfiguration.connectionTimeout = 1;
  }

  if (clientConfiguration.idleTimeout === 'DISABLE_TIMEOUT') {
    poolConfiguration.idleTimeout = 0;
  } else if (clientConfiguration.idleTimeout === 0) {
    poolLog.warn('idleTimeout=0 sets timeout to 0 milliseconds; use idleTimeout=DISABLE_TIMEOUT to disable timeout');

    poolConfiguration.idleTimeout = 1;
  }

  let pgNativeBindingsAreAvailable = false;

  try {
    /* eslint-disable global-require, import/no-unassigned-import */
    // $FlowFixMe
    require('pg-native');
    /* eslint-enable */

    pgNativeBindingsAreAvailable = true;

    poolLog.debug('found pg-native module');
  } catch (error) {
    poolLog.debug('pg-native module is not found');
  }

  let pg;

  if (clientConfiguration.preferNativeBindings && pgNativeBindingsAreAvailable) {
    poolLog.info('using native libpq bindings');

    // eslint-disable-next-line global-require
    pg = require('pg').native;
  } else if (clientConfiguration.preferNativeBindings && !pgNativeBindingsAreAvailable) {
    poolLog.info('using JavaScript bindings; pg-native not found');

    // eslint-disable-next-line global-require
    pg = require('pg');
  } else {
    poolLog.info('using JavaScript bindings');

    // eslint-disable-next-line global-require
    pg = require('pg');
  }

  const pool = new pg.Pool(poolConfiguration);

  pool.slonik = {
    poolId,
    typeOverrides: null,
  };

  // istanbul ignore next
  pool.on('error', (error) => {
    if (error.client.connection.slonik.terminated !== true) {
      poolLog.error({
        error: serializeError(error),
      }, 'client connection error');
    }
  });

  // istanbul ignore next
  pool.on('connect', (client) => {
    client.connection = client.connection || {};

    client.connection.slonik = {
      connectionId: createUlid(),
      transactionDepth: null,
    };

    client.on('notice', (notice) => {
      poolLog.info({
        notice: {
          level: notice.name,
          message: notice.message,
        },
      }, 'notice message');
    });

    poolLog.info({
      processId: client.processID,
      stats: {
        idleConnectionCount: pool.idleCount,
        totalConnectionCount: pool.totalCount,
        waitingRequestCount: pool.waitingCount,
      },
    }, 'created a new client connection');
  });

  // istanbul ignore next
  pool.on('acquire', (client) => {
    poolLog.info({
      processId: client.processID,
      stats: {
        idleConnectionCount: pool.idleCount,
        totalConnectionCount: pool.totalCount,
        waitingRequestCount: pool.waitingCount,
      },
    }, 'client is checked out from the pool');
  });

  // istanbul ignore next
  pool.on('remove', (client) => {
    poolLog.info({
      processId: client.processID,
      stats: {
        idleConnectionCount: pool.idleCount,
        totalConnectionCount: pool.totalCount,
        waitingRequestCount: pool.waitingCount,
      },
    }, 'client connection is closed and removed from the client pool');
  });

  return bindPool(poolLog, pool, clientConfiguration);
};

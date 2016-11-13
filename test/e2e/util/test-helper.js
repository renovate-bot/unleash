'use strict';

process.env.NODE_ENV = 'test';

let supertest = require('supertest');

const options = {
    databaseUri: require('./database-config').getDatabaseUri(),
    databaseSchema: 'test'
};

const migrator = require('../../../migrator');
const { createStores } = require('../../../lib/db');

// because of migrator bug
delete process.env.DATABASE_URL;

const db = require('../../../lib/db/db-pool').createDb(options.databaseUri);

const createApp = db.raw(`DROP SCHEMA IF EXISTS ${options.databaseSchema} CASCADE; CREATE SCHEMA ${options.databaseSchema}`)
    .then(() => migrator(options.databaseUri, options.databaseSchema))
    .then(() => {
        const stores = createStores(options);
        const app = require('../../../app')({stores});
        return { stores, request: supertest(app) };
    });

function createStrategies (stores) {
    return [
        {
            name: 'default',
            description: 'Default on or off Strategy.',
            parametersTemplate: {},
        },
        {
            name: 'usersWithEmail',
            description: 'Active for users defined  in the comma-separated emails-parameter.',
            parametersTemplate: {
                emails: 'String',
            },
        },
    ].map(strategy => stores.strategyStore._createStrategy(strategy));
}

function createClientStrategy (stores) {
    return [
        {
            appName: 'demo-sed',
            instanceId: 'test-1',
            strategies: ['default'],
            started: Date.now(),
            interval: 10 
        },
    ].map(client => stores.clientStrategyStore.insert(client));
}

function createClientInstance (stores) {
    return [
        {
            appName: 'demo-seed',
            instanceId: 'test-1',
            strategies: ['default'],
            started: Date.now(),
            interval: 10 
        },
    ].map(client => stores.clientInstanceStore.insert(client));
}

function createFeatures (stores) {
    return [
        {
            name: 'featureX',
            description: 'the #1 feature',
            enabled: true,
            strategies: [{ name: 'default', parameters: {} }],
        },
        {
            name: 'featureY',
            description: 'soon to be the #1 feature',
            enabled: false,
            strategies: [{
                name: 'baz',
                parameters: {
                    foo: 'bar',
                },
            }],
        },
        {
            name: 'featureZ',
            description: 'terrible feature',
            enabled: true,
            strategies: [{
                name: 'baz',
                parameters: {
                    foo: 'rab',
                },
            }],
        },
        {
            name: 'featureArchivedX',
            description: 'the #1 feature',
            enabled: true,
            archived: true,
            strategies: [{ name: 'default', parameters: {} }],
        },
        {
            name: 'featureArchivedY',
            description: 'soon to be the #1 feature',
            enabled: false,
            archived: true,
            strategies: [{
                name: 'baz',
                parameters: {
                    foo: 'bar',
                },
            }],
        },
        {
            name: 'featureArchivedZ',
            description: 'terrible feature',
            enabled: true,
            archived: true,
            strategies: [{
                name: 'baz',
                parameters: {
                    foo: 'rab',
                },
            }],
        },
    ].map(feature => stores.featureToggleStore._createFeature(feature));
}

function resetDatabase (stores) {
    return Promise.all([
        stores.db('strategies').del(), 
        stores.db('features').del(),
        stores.db('client_strategies').del(),
        stores.db('client_instances').del()
    ]);
}

function setupDatabase (stores) {
    return Promise.all(
        createStrategies(stores)
        .concat(createFeatures(stores)
        .concat(createClientInstance(stores))
        .concat(createClientStrategy(stores))))
}

module.exports = {
    setupApp () {
        return createApp.then((app) => {
            return resetDatabase(app.stores)
            .then(() => setupDatabase(app.stores))
            .then(() => app);
        });
    }
};
import { setupApp } from '../../helpers/test-helper';
import dbInit from '../../helpers/database-init';
import getLogger from '../../../fixtures/no-logger';
import User from '../../../../lib/types/user';
import UserStore from '../../../../lib/db/user-store';
import { AccessStore, IRole } from '../../../../lib/db/access-store';
import { RoleName } from '../../../../lib/services/access-service';
import EventStore from '../../../../lib/db/event-store';
import {
    USER_CREATED,
    USER_DELETED,
    USER_UPDATED,
} from '../../../../lib/types/events';

let stores;
let db;

let userStore: UserStore;
let eventStore: EventStore;
let accessStore: AccessStore;
let editorRole: IRole;
let adminRole: IRole;

beforeAll(async () => {
    db = await dbInit('user_admin_api_serial', getLogger);
    stores = db.stores;
    userStore = stores.userStore;
    accessStore = stores.accessStore;
    eventStore = stores.eventStore;
    const roles = await accessStore.getRootRoles();
    editorRole = roles.find(r => r.name === RoleName.EDITOR);
    adminRole = roles.find(r => r.name === RoleName.ADMIN);
});

afterAll(async () => {
    if (db) {
        await db.destroy();
    }
});

afterEach(async () => {
    await userStore.deleteAll();
});

test('returns empty list of users', async () => {
    expect.assertions(1);
    const request = await setupApp(stores);
    return request
        .get('/api/admin/user-admin')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(res => {
            expect(res.body.users.length).toBe(0);
        });
});

test('creates and returns all users', async () => {
    expect.assertions(2);
    const request = await setupApp(stores);

    const createUserRequests = [...Array(20).keys()].map(i =>
        request
            .post('/api/admin/user-admin')
            .send({
                email: `some${i}@getunleash.ai`,
                name: `Some Name ${i}`,
                rootRole: editorRole.id,
            })
            .set('Content-Type', 'application/json'),
    );

    await Promise.all(createUserRequests);

    return request
        .get('/api/admin/user-admin')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(res => {
            expect(res.body.users.length).toBe(20);
            expect(res.body.users[2].rootRole).toBe(editorRole.id);
        });
});

test('creates editor-user without password', async () => {
    expect.assertions(3);
    const request = await setupApp(stores);
    return request
        .post('/api/admin/user-admin')
        .send({
            email: 'some@getunelash.ai',
            name: 'Some Name',
            rootRole: editorRole.id,
        })
        .set('Content-Type', 'application/json')
        .expect(201)
        .expect(res => {
            expect(res.body.email).toBe('some@getunelash.ai');
            expect(res.body.rootRole).toBe(editorRole.id);
            expect(res.body.id).toBeTruthy();
        });
});

test('creates admin-user with password', async () => {
    expect.assertions(6);
    const request = await setupApp(stores);
    const { body } = await request
        .post('/api/admin/user-admin')
        .send({
            email: 'some@getunelash.ai',
            name: 'Some Name',
            password: 'some-strange-pass-123-GH',
            rootRole: adminRole.id,
        })
        .set('Content-Type', 'application/json')
        .expect(201);

    expect(body.rootRole).toBe(adminRole.id);

    const user = await userStore.get({ id: body.id });
    expect(user.email).toBe('some@getunelash.ai');
    expect(user.name).toBe('Some Name');

    const passwordHash = userStore.getPasswordHash(body.id);
    expect(passwordHash).toBeTruthy();

    const roles = await stores.accessStore.getRolesForUserId(body.id);
    expect(roles.length).toBe(1);
    expect(roles[0].name).toBe(RoleName.ADMIN);
});

test('requires known root role', async () => {
    expect.assertions(0);
    const request = await setupApp(stores);
    return request
        .post('/api/admin/user-admin')
        .send({
            email: 'some@getunelash.ai',
            name: 'Some Name',
            rootRole: 'Unknown',
        })
        .set('Content-Type', 'application/json')
        .expect(400);
});

test('update user name', async () => {
    expect.assertions(3);
    const request = await setupApp(stores);
    const { body } = await request
        .post('/api/admin/user-admin')
        .send({
            email: 'some@getunelash.ai',
            name: 'Some Name',
            rootRole: editorRole.id,
        })
        .set('Content-Type', 'application/json');

    return request
        .put(`/api/admin/user-admin/${body.id}`)
        .send({
            name: 'New name',
        })
        .set('Content-Type', 'application/json')
        .expect(200)
        .expect(res => {
            expect(res.body.email).toBe('some@getunelash.ai');
            expect(res.body.name).toBe('New name');
            expect(res.body.id).toBe(body.id);
        });
});

test('should delete user', async () => {
    expect.assertions(0);

    const user = await userStore.insert({ email: 'some@mail.com' });

    const request = await setupApp(stores);
    return request.delete(`/api/admin/user-admin/${user.id}`).expect(200);
});

test('validator should require strong password', async () => {
    expect.assertions(0);

    const request = await setupApp(stores);
    return request
        .post('/api/admin/user-admin/validate-password')
        .send({ password: 'simple' })
        .expect(400);
});

test('validator should accept strong password', async () => {
    expect.assertions(0);

    const request = await setupApp(stores);
    return request
        .post('/api/admin/user-admin/validate-password')
        .send({ password: 'simple123-_ASsad' })
        .expect(200);
});

test('should change password', async () => {
    expect.assertions(0);

    const user = await userStore.insert({ email: 'some@mail.com' });

    const request = await setupApp(stores);
    return request
        .post(`/api/admin/user-admin/${user.id}/change-password`)
        .send({ password: 'simple123-_ASsad' })
        .expect(200);
});

test('should search for users', async () => {
    expect.assertions(2);

    await userStore.insert({ email: 'some@mail.com' });
    await userStore.insert({ email: 'another@mail.com' });
    await userStore.insert({ email: 'another2@mail.com' });

    const request = await setupApp(stores);
    return request
        .get('/api/admin/user-admin/search?q=another')
        .expect(200)
        .expect(res => {
            expect(res.body.length).toBe(2);
            expect(res.body.some(u => u.email === 'another@mail.com')).toBe(
                true,
            );
        });
});

test('Creates a user and includes inviteLink and emailConfigured', async () => {
    expect.assertions(5);
    const request = await setupApp(stores);
    return request
        .post('/api/admin/user-admin')
        .send({
            email: 'some@getunelash.ai',
            name: 'Some Name',
            rootRole: editorRole.id,
        })
        .set('Content-Type', 'application/json')
        .expect(201)
        .expect(res => {
            expect(res.body.email).toBe('some@getunelash.ai');
            expect(res.body.rootRole).toBe(editorRole.id);
            expect(res.body.inviteLink).toBeTruthy();
            expect(res.body.emailSent).toBeFalsy();
            expect(res.body.id).toBeTruthy();
        });
});

test('generates USER_CREATED event', async () => {
    expect.assertions(5);
    const email = 'some@getunelash.ai';
    const name = 'Some Name';
    const request = await setupApp(stores);
    const { body } = await request
        .post('/api/admin/user-admin')
        .send({
            email,
            name,
            password: 'some-strange-pass-123-GH',
            rootRole: adminRole.id,
        })
        .set('Content-Type', 'application/json')
        .expect(201);

    const events = await eventStore.getEvents();

    expect(events[0].type).toBe(USER_CREATED);
    expect(events[0].data.email).toBe(email);
    expect(events[0].data.name).toBe(name);
    expect(events[0].data.id).toBe(body.id);
    expect(events[0].data.password).toBeFalsy();
});

test('generates USER_DELETED event', async () => {
    expect.assertions(3);
    const request = await setupApp(stores);

    const user = await userStore.insert({ email: 'some@mail.com' });
    await request.delete(`/api/admin/user-admin/${user.id}`);

    const events = await eventStore.getEvents();
    expect(events[0].type).toBe(USER_DELETED);
    expect(events[0].data.id).toBe(user.id);
    expect(events[0].data.email).toBe(user.email);
});

test('generates USER_UPDATED event', async () => {
    expect.assertions(3);
    const request = await setupApp(stores);
    const { body } = await request
        .post('/api/admin/user-admin')
        .send({
            email: 'some@getunelash.ai',
            name: 'Some Name',
            rootRole: editorRole.id,
        })
        .set('Content-Type', 'application/json');

    await request
        .put(`/api/admin/user-admin/${body.id}`)
        .send({
            name: 'New name',
        })
        .set('Content-Type', 'application/json');

    const events = await eventStore.getEvents();
    expect(events[0].type).toBe(USER_UPDATED);
    expect(events[0].data.id).toBe(body.id);
    expect(events[0].data.name).toBe('New name');
});

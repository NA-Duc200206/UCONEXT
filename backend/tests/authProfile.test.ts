import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Category, Product, User } from '../src/models';
import { authService } from '../src/services/authService';

describe('authService profile, preferences, addresses, recently viewed, and admin role management', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  async function createRegisteredUser(email = 'profile@uconext.test', name = 'Profile User') {
    const reg = await authService.register(name, email, 'StrongPass1', '127.0.0.1');
    const doc = await User.findById(reg.user.id);
    if (!doc) throw new Error('User not created');
    return { reg, doc };
  }

  it('updates profile, validates bounds, syncs cart, and changes password while revoking sessions', async () => {
    const { reg, doc } = await createRegisteredUser();

    const profile = await authService.getProfile(doc);
    expect(profile.email).toBe('profile@uconext.test');

    await expect(authService.updateProfile(doc, { name: 'A' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(authService.updateProfile(doc, { avatar: 'x'.repeat(501) })).rejects.toMatchObject({
      statusCode: 400,
    });

    const updated = await authService.updateProfile(doc, {
      name: 'Updated Profile',
      avatar: '/uploads/avatar/u1.webp',
    });
    expect(updated.name).toBe('Updated Profile');
    expect(updated.avatar).toBe('/uploads/avatar/u1.webp');

    await expect(authService.syncCart(doc, null as any)).rejects.toMatchObject({ statusCode: 400 });
    expect(
      await authService.syncCart(doc, [
        { productId: new Types.ObjectId(), name: 'Studio Mic', price: 500000, quantity: 2 },
      ])
    ).toBe(true);

    // Password change validation & success
    await expect(authService.changePassword(doc, { currentPassword: '', newPassword: '' })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      authService.changePassword(doc, { currentPassword: 'StrongPass1', newPassword: 'StrongPass1' })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      authService.changePassword(doc, { currentPassword: 'WrongPassword1', newPassword: 'NewPassword2' })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(
      await authService.changePassword(doc, { currentPassword: 'StrongPass1', newPassword: 'NewPassword2' })
    ).toBe(true);

    // Old refresh token is revoked after password change
    await expect(authService.refreshSession(reg.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('manages preferred categories with validation and limit of 5', async () => {
    const { doc } = await createRegisteredUser('prefs@uconext.test');
    const cats = await Promise.all(
      Array.from({ length: 6 }, (_, i) => Category.create({ name: `Cat ${i}`, slug: `cat-${i}` }))
    );

    await expect(authService.updatePreferences(doc, 'not-array')).rejects.toMatchObject({ statusCode: 400 });
    await expect(authService.updatePreferences(doc, ['invalid-id'])).rejects.toMatchObject({ statusCode: 400 });
    await expect(authService.updatePreferences(doc, cats.map((c) => c._id.toString()))).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(authService.updatePreferences(doc, [new Types.ObjectId().toString()])).rejects.toMatchObject({
      statusCode: 400,
    });

    const saved = await authService.updatePreferences(doc, [
      cats[0]._id.toString(),
      cats[1]._id.toString(),
      cats[0]._id.toString(), // duplicate deduplicated
    ]);
    expect(saved.preferredCategories).toHaveLength(2);
  });

  it('performs full saved address CRUD with default rotation and 10-address cap', async () => {
    const { doc } = await createRegisteredUser('addr@uconext.test');

    // First address automatically becomes default
    await authService.addAddress(doc, {
      label: 'Home',
      fullName: 'Alice Nguyen',
      phone: '0901234567',
      address: '12 Nguyen Hue, District 1, HCMC',
    });
    let addresses = await authService.getAddresses(doc);
    expect(addresses).toHaveLength(1);
    expect(addresses[0].isDefault).toBe(true);

    // Add second address as new default
    await authService.addAddress(doc, {
      label: 'Office',
      fullName: 'Alice Nguyen',
      phone: '0909876543',
      address: '99 Le Loi, District 1, HCMC',
      isDefault: true,
    });
    addresses = await authService.getAddresses(doc);
    expect(addresses).toHaveLength(2);
    expect(addresses[0].isDefault).toBe(false);
    expect(addresses[1].isDefault).toBe(true);

    // Update address: unset default falls back to another address
    const secondId = String(addresses[1]._id);
    await authService.updateAddress(doc, secondId, { label: 'HQ', isDefault: false });
    addresses = await authService.getAddresses(doc);
    expect(addresses[1].label).toBe('HQ');
    expect(addresses[0].isDefault).toBe(true);

    // Re-set default and delete it -> promotes remaining address
    await authService.updateAddress(doc, secondId, { isDefault: true });
    await authService.deleteAddress(doc, secondId);
    addresses = await authService.getAddresses(doc);
    expect(addresses).toHaveLength(1);
    expect(addresses[0].isDefault).toBe(true);

    // Invalid / missing address IDs
    await expect(authService.updateAddress(doc, 'bad', { label: 'X' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      authService.updateAddress(doc, new Types.ObjectId().toString(), { label: 'X' })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(authService.deleteAddress(doc, 'bad')).rejects.toMatchObject({ statusCode: 400 });
    await expect(authService.deleteAddress(doc, new Types.ObjectId().toString())).rejects.toMatchObject({
      statusCode: 404,
    });

    // Cap at 10 addresses
    for (let i = 0; i < 9; i++) {
      await authService.addAddress(doc, {
        label: `Addr ${i}`,
        fullName: 'Alice Nguyen',
        phone: '0901234567',
        address: `${i + 1} Pasteur St, HCMC`,
      });
    }
    await expect(
      authService.addAddress(doc, {
        label: 'Overflow',
        fullName: 'Alice Nguyen',
        phone: '0901234567',
        address: '100 Overflow St, HCMC',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('tracks recently viewed products and handles admin user listing & role updates', async () => {
    const { doc } = await createRegisteredUser('rv@uconext.test', 'Viewer');
    const cat = await Category.create({ name: 'Bags', slug: 'bags-rv' });
    const p1 = await Product.create({ name: 'Backpack', slug: 'backpack', price: 900000, stock: 5, categoryId: cat._id as any });
    const p2 = await Product.create({ name: 'Tote Bag', slug: 'tote-bag', price: 500000, stock: 5, categoryId: cat._id as any });

    const uid = doc._id.toString();
    await expect(authService.recordRecentlyViewed(uid, 'bad')).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      authService.recordRecentlyViewed(uid, new Types.ObjectId().toString())
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(authService.getRecentlyViewed(new Types.ObjectId().toString())).rejects.toMatchObject({
      statusCode: 404,
    });

    await authService.recordRecentlyViewed(uid, p1._id.toString());
    const afterTwo = await authService.recordRecentlyViewed(uid, p2._id.toString());
    expect(afterTwo).toHaveLength(2);
    expect(String(afterTwo[0].id)).toBe(p2._id.toString());

    expect(await authService.clearRecentlyViewed(uid)).toEqual([]);
    expect(await authService.getRecentlyViewed(uid)).toEqual([]);

    // Admin user listing & role update
    const allUsers = await authService.getAllUsers();
    expect(allUsers).toHaveLength(1);

    await expect(authService.updateUserRole(uid, 'superadmin')).rejects.toMatchObject({ statusCode: 400 });
    await expect(authService.updateUserRole('bad-id', 'admin')).rejects.toMatchObject({ statusCode: 404 });
    await expect(authService.updateUserRole(new Types.ObjectId().toString(), 'admin')).rejects.toMatchObject({
      statusCode: 404,
    });

    const promoted = await authService.updateUserRole(uid, 'warehouse', uid, '127.0.0.1');
    expect(promoted.role).toBe('warehouse');
    const refreshed = await User.findById(uid);
    expect(refreshed?.tokenVersion).toBe(1);
  });
});

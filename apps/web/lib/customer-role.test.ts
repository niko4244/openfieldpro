import assert from "node:assert/strict";
import test from "node:test";
import { customerWorkspaceCapabilities } from "./customer-role";

test("office roles manage customer, equipment, plans, and job financial context", () => {
  for (const role of ["owner", "dispatcher"] as const) {
    assert.deepEqual(customerWorkspaceCapabilities(role), {
      createCustomer: true,
      editCustomer: true,
      addEquipment: true,
      updateEquipment: true,
      deleteEquipment: true,
      manageServicePlans: true,
      showJobFinancials: true,
    });
  }
});

test("technicians can record assigned equipment without office customer controls", () => {
  assert.deepEqual(customerWorkspaceCapabilities("technician"), {
    createCustomer: false,
    editCustomer: false,
    addEquipment: true,
    updateEquipment: true,
    deleteEquipment: false,
    manageServicePlans: false,
    showJobFinancials: false,
  });
});

test("unauthenticated customer workspaces expose no mutation capability", () => {
  assert.deepEqual(customerWorkspaceCapabilities(null), {
    createCustomer: false,
    editCustomer: false,
    addEquipment: false,
    updateEquipment: false,
    deleteEquipment: false,
    manageServicePlans: false,
    showJobFinancials: false,
  });
});

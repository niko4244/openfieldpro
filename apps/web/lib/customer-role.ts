export type CustomerWorkspaceRole = "owner" | "dispatcher" | "technician" | null;

export interface CustomerWorkspaceCapabilities {
  createCustomer: boolean;
  editCustomer: boolean;
  addEquipment: boolean;
  updateEquipment: boolean;
  deleteEquipment: boolean;
  manageServicePlans: boolean;
  showJobFinancials: boolean;
}

export function customerWorkspaceCapabilities(
  role: CustomerWorkspaceRole,
): CustomerWorkspaceCapabilities {
  const office = role === "owner" || role === "dispatcher";
  const authenticated = office || role === "technician";

  return {
    createCustomer: office,
    editCustomer: office,
    addEquipment: authenticated,
    updateEquipment: authenticated,
    deleteEquipment: office,
    manageServicePlans: office,
    showJobFinancials: office,
  };
}

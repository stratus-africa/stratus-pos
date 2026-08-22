import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  Edit,
  MapPin,
  Plus,
  RefreshCw,
  Store,
  Warehouse,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";

import StockTransfersTab from "@/components/settings/StockTransfersTab";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type LocationType = "store" | "warehouse" | "branch";

interface Location {
  id: string;
  business_id: string;
  name: string;
  type: string;
  address: string | null;
  is_active: boolean;
}

interface LocationForm {
  name: string;
  type: LocationType;
  address: string;
}

const LOCATION_TYPES: Array<{
  value: LocationType;
  label: string;
  description: string;
}> = [
  {
    value: "store",
    label: "Store",
    description: "Retail store or sales outlet",
  },
  {
    value: "warehouse",
    label: "Warehouse",
    description: "Warehouse or stock holding facility",
  },
  {
    value: "branch",
    label: "Branch",
    description: "Business branch or office",
  },
];

function normalizeLocationType(value: string): LocationType {
  if (value === "warehouse") return "warehouse";
  if (value === "branch") return "branch";
  return "store";
}

function LocationIcon({ type, className = "h-5 w-5" }: { type: string; className?: string }) {
  if (type === "warehouse") {
    return <Warehouse className={className} />;
  }

  if (type === "branch") {
    return <Building2 className={className} />;
  }

  return <Store className={className} />;
}

export function LocationsTab() {
  const { business, locations: contextLocations, currentLocation, setCurrentLocation, refreshBusiness } = useBusiness();

  const { hasPermission } = usePermissions();

  const canViewLocations =
    hasPermission("multi_location.view") || hasPermission("settings.locations_view") || hasPermission("settings.view");

  const canManageLocations =
    hasPermission("multi_location.manage_locations") ||
    hasPermission("settings.locations_create") ||
    hasPermission("settings.locations_edit") ||
    hasPermission("settings.locations_disable") ||
    hasPermission("settings.edit");

  const canTransfer = hasPermission("multi_location.transfer_stock");

  const canApproveTransfers = hasPermission("multi_location.approve_transfers");

  const [locations, setLocations] = useState<Location[]>(contextLocations as Location[]);

  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("locations");

  const [dialogOpen, setDialogOpen] = useState(false);

  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<LocationForm>({
    name: "",
    type: "store",
    address: "",
  });

  const activeLocations = useMemo(() => locations.filter((location) => location.is_active), [locations]);

  const inactiveLocations = useMemo(() => locations.filter((location) => !location.is_active), [locations]);

  const locationLimitReached = false;

  useEffect(() => {
    setLocations(contextLocations as Location[]);
  }, [contextLocations]);

  const loadLocations = async () => {
    if (!business) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("locations")
        .select("id, business_id, name, type, address, is_active")
        .eq("business_id", business.id)
        .order("name", {
          ascending: true,
        });

      if (error) throw error;

      setLocations((data || []) as Location[]);
    } catch (error: any) {
      toast.error(error?.message || "Unable to load locations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLocations();
  }, [business?.id]);

  const resetForm = () => {
    setEditingLocation(null);

    setForm({
      name: "",
      type: "store",
      address: "",
    });
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (location: Location) => {
    setEditingLocation(location);

    setForm({
      name: location.name,
      type: normalizeLocationType(location.type),
      address: location.address || "",
    });

    setDialogOpen(true);
  };

  const saveLocation = async () => {
    if (!business) return;

    if (!canManageLocations) {
      toast.error("You do not have permission to manage locations.");
      return;
    }

    const name = form.name.trim();

    if (!name) {
      toast.error("Enter a location name.");
      return;
    }

    if (name.length < 2) {
      toast.error("Location name must contain at least 2 characters.");
      return;
    }

    setSaving(true);

    try {
      if (editingLocation) {
        const { error } = await supabase
          .from("locations")
          .update({
            name,
            type: form.type,
            address: form.address.trim() || null,
          })
          .eq("id", editingLocation.id)
          .eq("business_id", business.id);

        if (error) throw error;

        toast.success("Location updated successfully.");
      } else {
        if (locationLimitReached) {
          toast.error("Your subscription has reached its location limit.");
          return;
        }

        const { error } = await supabase.from("locations").insert({
          business_id: business.id,
          name,
          type: form.type,
          address: form.address.trim() || null,
          is_active: true,
        });

        if (error) throw error;

        toast.success("Location created successfully.");
      }

      setDialogOpen(false);
      resetForm();

      await loadLocations();

      if (refreshBusiness) {
        await refreshBusiness();
      }
    } catch (error: any) {
      toast.error(error?.message || "Unable to save location.");
    } finally {
      setSaving(false);
    }
  };

  const toggleLocation = async (location: Location) => {
    if (!business) return;

    if (!canManageLocations) {
      toast.error("You do not have permission to change location status.");
      return;
    }

    if (location.is_active && activeLocations.length <= 1) {
      toast.error("The business must have at least one active location.");
      return;
    }

    const nextActive = !location.is_active;

    try {
      const { error } = await supabase
        .from("locations")
        .update({
          is_active: nextActive,
        })
        .eq("id", location.id)
        .eq("business_id", business.id);

      if (error) throw error;

      toast.success(nextActive ? `${location.name} activated.` : `${location.name} disabled.`);

      if (!nextActive && currentLocation?.id === location.id) {
        const replacement = activeLocations.find((candidate) => candidate.id !== location.id);

        if (replacement) {
          setCurrentLocation(replacement);
        }
      }

      await loadLocations();

      if (refreshBusiness) {
        await refreshBusiness();
      }
    } catch (error: any) {
      toast.error(error?.message || "Unable to change location status.");
    }
  };

  const selectCurrentLocation = (location: Location) => {
    if (!location.is_active) {
      toast.error("Inactive locations cannot be selected.");
      return;
    }

    setCurrentLocation(location);

    toast.success(`${location.name} is now your current location.`);
  };

  if (!canViewLocations) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MapPin className="mx-auto h-10 w-10 text-muted-foreground" />

          <h3 className="mt-4 font-semibold">Locations</h3>

          <p className="mt-1 text-sm text-muted-foreground">You don't have permission to view business locations.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />

          <h2 className="text-xl font-semibold">Locations</h2>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Manage stores, warehouses, branches and inter-location inventory transfers.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="grid w-full grid-cols-2 sm:w-fit sm:grid-cols-2">
          <TabsTrigger value="locations" className="gap-2">
            <MapPin className="h-4 w-4" />
            Locations
          </TabsTrigger>

          <TabsTrigger value="transfers" className="gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transfers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="locations" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Locations</p>

                <p className="mt-1 text-2xl font-semibold">{locations.length}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Active</p>

                <p className="mt-1 text-2xl font-semibold">{activeLocations.length}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Inactive</p>

                <p className="mt-1 text-2xl font-semibold">{inactiveLocations.length}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Current Location</p>

                <p className="mt-1 truncate text-lg font-semibold">{currentLocation?.name || "Not selected"}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Business Locations</CardTitle>

                  <CardDescription>
                    Each location maintains its own stock balance and operational context.
                  </CardDescription>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void loadLocations()} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>

                  {canManageLocations && (
                    <Button size="sm" onClick={openCreate}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Location
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {locations.length === 0 ? (
                <div className="rounded-lg border border-dashed py-12 text-center">
                  <MapPin className="mx-auto h-10 w-10 text-muted-foreground" />

                  <h3 className="mt-4 font-medium">No locations</h3>

                  <p className="mt-1 text-sm text-muted-foreground">Add your first store, warehouse or branch.</p>

                  {canManageLocations && (
                    <Button className="mt-4" onClick={openCreate}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Location
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location</TableHead>

                        <TableHead>Type</TableHead>

                        <TableHead>Address</TableHead>

                        <TableHead>Status</TableHead>

                        <TableHead>Current</TableHead>

                        <TableHead className="w-[180px]" />
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {locations.map((location) => {
                        const isCurrent = currentLocation?.id === location.id;

                        return (
                          <TableRow key={location.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/40">
                                  <LocationIcon type={location.type} className="h-4 w-4" />
                                </div>

                                <div>
                                  <p className="font-medium">{location.name}</p>

                                  <p className="text-xs text-muted-foreground">{location.id}</p>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>
                              <Badge variant="outline">
                                {LOCATION_TYPES.find((type) => type.value === normalizeLocationType(location.type))
                                  ?.label || location.type}
                              </Badge>
                            </TableCell>

                            <TableCell className="max-w-[280px] truncate text-muted-foreground">
                              {location.address || "—"}
                            </TableCell>

                            <TableCell>
                              {location.is_active ? (
                                <Badge>
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  <XCircle className="mr-1 h-3.5 w-3.5" />
                                  Inactive
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell>
                              {isCurrent ? (
                                <Badge variant="outline">Current</Badge>
                              ) : (
                                location.is_active && (
                                  <Button size="sm" variant="ghost" onClick={() => selectCurrentLocation(location)}>
                                    Select
                                  </Button>
                                )
                              )}
                            </TableCell>

                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {canManageLocations && (
                                  <>
                                    <Button size="sm" variant="ghost" onClick={() => openEdit(location)}>
                                      <Edit className="mr-1.5 h-4 w-4" />
                                      Edit
                                    </Button>

                                    <Button size="sm" variant="ghost" onClick={() => void toggleLocation(location)}>
                                      {location.is_active ? "Disable" : "Activate"}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Location Operations</CardTitle>

              <CardDescription>Multi-location features available in this business.</CardDescription>
            </CardHeader>

            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <Warehouse className="h-4 w-4" />

                    <p className="font-medium">Stock by Location</p>
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Inventory balances are maintained independently for each location.
                  </p>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4" />

                    <p className="font-medium">Stock Transfers</p>
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Move inventory between locations with an approval workflow.
                  </p>

                  {!canTransfer && (
                    <Badge variant="secondary" className="mt-3">
                      No transfer permission
                    </Badge>
                  )}
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />

                    <p className="font-medium">Transfer Approval</p>
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Approved users can review and approve stock movement requests.
                  </p>

                  {!canApproveTransfers && (
                    <Badge variant="secondary" className="mt-3">
                      No approval permission
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers" className="space-y-5">
          <StockTransfersTab />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Edit Location" : "Add Location"}</DialogTitle>

            <DialogDescription>
              {editingLocation
                ? "Update the location details."
                : "Create a store, warehouse or branch for this business."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="location-name">Location Name</Label>

              <Input
                id="location-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g. Main Store"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Location Type</Label>

              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    type: value as LocationType,
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {LOCATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex flex-col">
                        <span>{type.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <p className="text-xs text-muted-foreground">
                {LOCATION_TYPES.find((type) => type.value === form.type)?.description}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-address">Address</Label>

              <Textarea
                id="location-address"
                value={form.address}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
                placeholder="Physical address or location description"
                disabled={saving}
              />
            </div>

            {editingLocation && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">Location status</p>

                <p className="mt-1 text-sm text-muted-foreground">
                  This location is currently {editingLocation.is_active ? "active" : "inactive"}.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>

            <Button onClick={() => void saveLocation()} disabled={saving || !form.name.trim()}>
              {saving ? "Saving..." : editingLocation ? "Save Changes" : "Create Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LocationsTab;

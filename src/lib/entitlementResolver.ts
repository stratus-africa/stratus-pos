export async function updatePlanModules(
  planId: string,
  moduleKeys: string[],
): Promise<{ success: boolean; message: string }> {
  // Normalize and deduplicate module keys before sending them to Supabase.
  const normalizedKeys = [...new Set(moduleKeys.map((key) => key.trim().toLowerCase()).filter(Boolean))];

  try {
    const { data, error } = await supabase.rpc("set_plan_modules", {
      _package_id: planId,
      _module_keys: normalizedKeys,
    });

    if (error) {
      console.error("Error updating plan modules:", error);

      return {
        success: false,
        message: error.message || "Unable to update plan modules.",
      };
    }

    // Supabase returns RETURNS TABLE(...) RPC results as an array.
    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      return {
        success: false,
        message: "The module update returned no result.",
      };
    }

    if (!result.success) {
      return {
        success: false,
        message: result.message || "Unable to update plan modules.",
      };
    }

    return {
      success: true,
      message: result.message || "Plan modules updated successfully.",
    };
  } catch (error) {
    console.error("Unexpected error updating plan modules:", error);

    return {
      success: false,
      message: error instanceof Error ? error.message : "An unexpected error occurred while updating plan modules.",
    };
  }
}

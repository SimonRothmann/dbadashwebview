using System.Security.Claims;
using DBADashWebView.Data;

namespace DBADashWebView.Endpoints;

/// <param name="InstanceIds">
/// Every active instance carrying the tag, from both association sources.
/// </param>
/// <param name="InheritedInstanceIds">
/// Subset of <paramref name="InstanceIds"/> whose association comes only from
/// the Azure SQL server-level table. These are not per-instance assignments and
/// cannot be removed instance by instance.
/// </param>
public sealed record TagRow(
    int TagId,
    string TagName,
    string? TagValue,
    bool IsSystem,
    int[] InstanceIds,
    int[] InheritedInstanceIds);

/// <summary>
/// Read-only view of DBA Dash's real tag schema for the Groups &amp; Tags page.
///
/// DBA Dash stores tag associations in two places and its own
/// <c>dbo.InstanceTags_Get</c> / <c>dbo.Tags_Get</c> procedures read both:
///   * <c>dbo.InstanceIDsTags</c> keys on <c>InstanceID</c> and covers ordinary
///     instances;
///   * <c>dbo.InstanceTags</c> keys on the instance <em>name</em> and holds
///     server-level tags inherited by Azure SQL databases (EngineEdition 5).
///
/// Reading only the first source silently omits every inherited Azure tag, so
/// both are unioned here.
///
/// System tags (populated by <c>dbo.SystemTags_Upd</c>, named like
/// <c>{Version}</c>) are flagged so the UI can present them as read-only.
/// </summary>
public static class TagsEndpointMappings
{
    /// <remarks>
    /// Mirrors the two branches of <c>dbo.InstanceTags_Get</c>. The Azure branch
    /// joins on <c>Instance</c> rather than <c>InstanceID</c>: unlike
    /// <c>dbo.InstanceIDsTags</c>, <c>dbo.InstanceTags</c> is keyed by instance
    /// name and has no id column at all.
    /// </remarks>
    private const string TagQuery =
        """
        SELECT T.TagID, T.TagName, T.TagValue, I.InstanceID, CAST(0 AS bit) AS IsInherited
        FROM dbo.Tags T
        JOIN dbo.InstanceIDsTags IT ON IT.TagID = T.TagID
        JOIN dbo.Instances I ON I.InstanceID = IT.InstanceID
        WHERE I.IsActive = 1

        UNION ALL

        SELECT T.TagID, T.TagName, T.TagValue, I.InstanceID, CAST(1 AS bit) AS IsInherited
        FROM dbo.Tags T
        JOIN dbo.InstanceTags IT ON IT.TagID = T.TagID
        JOIN dbo.Instances I ON I.Instance = IT.Instance
        WHERE I.IsActive = 1
          AND I.EngineEdition = 5

        ORDER BY TagName, TagValue
        """;

    public static IEndpointRouteBuilder MapTagsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/tags", async (
            ClaimsPrincipal user,
            SqlDataService sql,
            ILogger<Program> logger,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                var rows = await sql.QueryAsync(TagQuery, cancellationToken);
                return Results.Ok(BuildTagRows(rows, allowedIds));
            }
            catch (Exception ex)
            {
                // The exception text can name tables and logins, so it is logged
                // server-side and never returned to the caller.
                logger.LogError(ex, "Tags endpoint failed");
                return Results.Problem(
                    title: "Unable to read tags",
                    statusCode: StatusCodes.Status500InternalServerError);
            }
        }).RequireAuthorization();

        return endpoints;
    }

    /// <summary>
    /// Groups flat (TagID, TagName, TagValue, InstanceID, IsInherited) rows into
    /// one <see cref="TagRow"/> per tag, applying the caller's instance scope and
    /// dropping tags that have no instances left once scoped. Kept separate from
    /// the SQL so it can be unit tested with synthetic rows.
    ///
    /// An Azure instance can appear in both branches of the query; such an
    /// instance is listed once and counts as a direct assignment, because a
    /// removable per-instance row does exist for it.
    /// </summary>
    internal static List<TagRow> BuildTagRows(
        List<Dictionary<string, object?>> rows,
        HashSet<int>? allowedInstanceIds)
    {
        var tags = new Dictionary<int, (string TagName, string? TagValue, Dictionary<int, bool> Instances)>();
        foreach (var row in rows)
        {
            var instanceId = Convert.ToInt32(row["InstanceID"]);
            if (allowedInstanceIds is not null && !allowedInstanceIds.Contains(instanceId))
            {
                continue;
            }

            var tagId = Convert.ToInt32(row["TagID"]);
            if (!tags.TryGetValue(tagId, out var entry))
            {
                entry = (row["TagName"]?.ToString() ?? string.Empty, row["TagValue"]?.ToString(), new Dictionary<int, bool>());
                tags[tagId] = entry;
            }

            var isInherited = Convert.ToBoolean(row["IsInherited"]);
            // A direct row always wins over an inherited one for the same pair.
            entry.Instances[instanceId] = entry.Instances.TryGetValue(instanceId, out var seen)
                ? seen && isInherited
                : isInherited;
        }

        return tags
            .Where(kvp => kvp.Value.Instances.Count > 0)
            .Select(kvp => new TagRow(
                kvp.Key,
                kvp.Value.TagName,
                kvp.Value.TagValue,
                kvp.Value.TagName.StartsWith('{'),
                kvp.Value.Instances.Keys.OrderBy(id => id).ToArray(),
                kvp.Value.Instances.Where(p => p.Value).Select(p => p.Key).OrderBy(id => id).ToArray()))
            .OrderBy(t => t.IsSystem)
            .ThenBy(t => t.TagName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(t => t.TagValue, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}

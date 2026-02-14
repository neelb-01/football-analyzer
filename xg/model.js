// xg/model.js

function calculateXG(shots) {
    let total = 0;

    const results = shots.map(shot => {
        const x = shot.location?.[0] || 0;
        const y = shot.location?.[1] || 0;

        const goalX = 120;
        const goalY = 40;

        const dx = goalX - x;
        const dy = goalY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // NORMALIZE distance
        const maxDistance = 40;
        const normDistance = Math.min(distance / maxDistance, 1);

        // Angle
        const leftPostY = 36;
        const rightPostY = 44;

        const angleToLeft = Math.atan2(leftPostY - y, goalX - x);
        const angleToRight = Math.atan2(rightPostY - y, goalX - x);

        let angle = Math.abs(angleToRight - angleToLeft);
        if (angle > Math.PI) angle = 2 * Math.PI - angle;

        // NORMALIZE angle (0 → 1)
        const maxAngle = Math.PI / 2; // 90 degrees
        const normAngle = Math.min(angle / maxAngle, 1);

        // Penalty
        if (shot.shot?.type?.name === "Penalty") {
            total += 0.79;
            return {
                player: shot.player?.name || "Unknown",
                team: shot.team?.name || "Unknown",
                xg: 0.79
            };
        }

        // Modifiers
        let bodyFactor = shot.shot?.body_part?.name === "Head" ? 0.7 : 1;
        let typeFactor = shot.shot?.type?.name === "Free Kick" ? 0.6 : 1;
        let pressureFactor = shot.under_pressure ? 0.8 : 1;

        // Logistic model
        const linear =
            -2.2
            - 4.0 * normDistance
            + 1.8 * normAngle;

        let xg = 1 / (1 + Math.exp(-linear));
        xg *= bodyFactor * typeFactor * pressureFactor;
        xg = Math.max(0, Math.min(1, xg));

        total += xg;

        return {
            player: shot.player?.name || "Unknown",
            team: shot.team?.name || "Unknown",
            xg: Number(xg.toFixed(3))
        };
    });

    return {
        totalXG: Number(total.toFixed(3)),
        shots: results
    };
}

module.exports = { calculateXG };
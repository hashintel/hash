package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.NodeSortOrder
import com.intellij.ide.projectView.NodeSortSettings
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiDirectoryNode
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDirectory

class ModuleDirectoryNode(project: Project?, value: PsiDirectory, viewSettings: ViewSettings?): PsiDirectoryNode(project, value, viewSettings) {
    // This is needed, as otherwise the `GroupByTypeComparator` won't fall back to the `AlphaComparator`
    override fun getTypeSortWeight(sortByType: Boolean): Int = 0

    // this is the same weight of a file, allows us to group them together
    override fun getWeight(): Int = 20

    // this is the default `SortKey` of `RsFile`, using the same allows us to group those together
    override fun getSortKey(): Int = 0

    // taken from ProjectView, overwrites the directory sort order
    @Suppress("UnstableApiUsage")
    override fun getSortOrder(settings: NodeSortSettings): NodeSortOrder =
        if (settings.isManualOrder) NodeSortOrder.MANUAL else NodeSortOrder.UNSPECIFIED


    // a bit of a hack, if the `SortKey` is the same the `GroupByTypeComparator` redirects to the `AlphaComparator`,
    // if the weights of both files are the same, the `AlphaComparator` uses the `FileNameComparator` with the `toString`
    // representation of a node. For the node to be able to be displayed above the directory we "emulate" the name of
    // the file (and add `.mod` to ensure that we're always last).
    // AFAIK `toString()` is not used anywhere else.
    override fun toString(): String {
        val name = super.toString()

        return "$name.rs.mod"
    }
}

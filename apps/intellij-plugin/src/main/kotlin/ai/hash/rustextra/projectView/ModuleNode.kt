package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.NodeSortOrder
import com.intellij.ide.projectView.NodeSortSettings
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile

class ModuleNode(
    project: Project,
    value: PsiFile,
    viewSettings: ViewSettings?,
    private val children: Collection<AbstractTreeNode<*>>,
) :
    PsiFileNode(project, value, viewSettings) {

    override fun getSortOrder(settings: NodeSortSettings): NodeSortOrder = if (settings.isFoldersAlwaysOnTop) {
        NodeSortOrder.FOLDER
    } else {
        super.getSortOrder(settings)
    }

    override fun getChildrenImpl(): Collection<AbstractTreeNode<*>> = children

    override fun contains(file: VirtualFile): Boolean = children.any { child ->
        val value = child.value

        if (value is PsiFile) {
            value.virtualFile.equals(file)
        } else {
            false
        }
    }

    override fun expandOnDoubleClick(): Boolean = false

    companion object {
        fun fromPsiFileNode(node: AbstractTreeNode<PsiFile>, settings: ViewSettings?, children: Collection<AbstractTreeNode<*>>) =
            ModuleNode(node.project, node.value, settings, children)
    }
}
